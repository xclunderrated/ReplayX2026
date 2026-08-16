import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { NewsEvent } from "./src/lib/news";

// ============================================================
// ForexFactory Unofficial API — vendored scraper
// Ported from https://github.com/xclunderrated/ForexFactory-Unofficial-API
// with an added persistent disk cache so historical backtest
// weeks load instantly across server restarts.
// ============================================================

export type ImpactLevel = "High" | "Medium" | "Low" | "Non-Economic" | "Unknown";

export interface ScrapedEvent {
  id: string;
  date: string;
  time: string;
  currency: string;
  impact: ImpactLevel;
  impactTitle: string;
  impactClass: string;
  title: string;
  detailId?: string;
  actual: string;
  forecast: string;
  previous: string;
  actualStatus?: "better" | "worse" | "neutral";
  rawRowData?: string[];
}

export interface ScrapeResult {
  url: string;
  dateQueried: string;
  timestamp: string;
  totalEventsFound: number;
  events: ScrapedEvent[];
  rawHtmlLength?: number;
  selectorUsed?: string;
  error?: string;
  notes?: string;
  latencyMs?: number;
  cached?: boolean;
}

export interface ScrapeRangeResult {
  events: NewsEvent[];
  daysScraped: number;
  errors: Record<string, string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_TTL = 24 * 60 * 60 * 1000;
const TODAY_TTL = 3 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".forexfactory-cache");
const MAX_DAYS = 15;
const CONCURRENCY = 4;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ------------------------------------------------------------
// Date helpers (UTC-based, matching ForexFactory's GMT calendar)
// ------------------------------------------------------------

function toUTCDateKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatDateToFFParam(dateStr: string): { dayParam: string; formattedDate: string } {
  let dateObj: Date;
  if (!dateStr || dateStr === "today") {
    dateObj = new Date();
  } else {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      dateObj = new Date(Date.UTC(y, m, d));
    } else {
      dateObj = new Date(dateStr);
    }

    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
  }

  const monthStr = MONTHS[dateObj.getUTCMonth()];
  const dayNum = dateObj.getUTCDate();
  const yearNum = dateObj.getUTCFullYear();

  const dayParam = `${monthStr}${dayNum}.${yearNum}`;
  const formattedDate = `${yearNum}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

  return { dayParam, formattedDate };
}

export function parseFFTimeToMinutes(timeStr: string): number {
  const time = (timeStr || "").trim().toLowerCase();
  if (!time) return 0;

  const match = time.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const meridiem = match[3];

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function buildEventTimestamp(dateKey: string, timeStr: string): number {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return Date.UTC(y, m, d) + parseFFTimeToMinutes(timeStr) * 60 * 1000;
}

export function getDayKeysInRange(fromISO: string, toISO: string, maxDays: number = MAX_DAYS): string[] {
  const fromTs = new Date(fromISO).getTime();
  const toTs = new Date(toISO).getTime();
  if (isNaN(fromTs) || isNaN(toTs)) return [];

  const fromMs = Math.floor(fromTs / DAY_MS) * DAY_MS;
  const toMs = Math.floor(toTs / DAY_MS) * DAY_MS;
  if (fromMs > toMs) return [];

  const keys: string[] = [];
  for (let ms = fromMs; ms <= toMs && keys.length < maxDays; ms += DAY_MS) {
    keys.push(toUTCDateKey(ms));
  }
  return keys;
}

export function filterEventsByCurrencies<T extends { currency: string }>(events: T[], currencies: string[]): T[] {
  if (!currencies || currencies.length === 0) return events;
  const allowed = new Set(currencies.map((c) => c.toUpperCase()));
  return events.filter((ev) => allowed.has((ev.currency || "").toUpperCase()));
}

// ------------------------------------------------------------
// In-memory TTL cache + persistent disk cache
// ------------------------------------------------------------

interface CacheEntry {
  data: ScrapeResult;
  expiresAt: number;
}

const scrapeCache = new Map<string, CacheEntry>();

function diskCachePath(dateKey: string): string {
  return path.join(CACHE_DIR, `${dateKey}.json`);
}

function readDiskCache(dateKey: string): ScrapeResult | null {
  try {
    const raw = fs.readFileSync(diskCachePath(dateKey), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.events)) {
      return parsed as ScrapeResult;
    }
  } catch {
    // Corrupt or missing disk cache — ignore, will re-scrape.
  }
  return null;
}

function writeDiskCache(dateKey: string, data: ScrapeResult): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(diskCachePath(dateKey), JSON.stringify(data));
  } catch (err: any) {
    console.warn(`[FF Scraper] Could not write disk cache for ${dateKey}:`, err?.message || err);
  }
}

// ------------------------------------------------------------
// Scraper core (multi-tier fetch strategy)
// ------------------------------------------------------------

async function scrapeForexFactory(dateStr: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  const { dayParam, formattedDate } = formatDateToFFParam(dateStr);
  const targetUrl = `https://www.forexfactory.com/calendar?day=${dayParam}`;
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;

  const cachedEntry = scrapeCache.get(formattedDate);
  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    const elapsed = Date.now() - startTime;
    console.log(`[FF Scraper] Memory cache HIT for date: ${formattedDate} (${elapsed}ms)`);
    return {
      ...cachedEntry.data,
      latencyMs: elapsed,
      cached: true,
    };
  }

  const diskEntry = readDiskCache(formattedDate);
  if (diskEntry) {
    scrapeCache.set(formattedDate, {
      data: diskEntry,
      expiresAt: Date.now() + HISTORICAL_TTL,
    });
    console.log(`[FF Scraper] Disk cache HIT for date: ${formattedDate}`);
    return { ...diskEntry, latencyMs: Date.now() - startTime, cached: true };
  }

  console.log(`[FF Scraper] Scraping ForexFactory for date: ${formattedDate} (${dayParam})`);

  let html = "";
  let scraperMethod = "";

  // Strategy 1: Jina Reader HTML mode (bypasses Cloudflare & renders full HTML)
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        "X-Return-Format": "html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-No-Cache": "true",
      },
    });

    if (res.ok) {
      const text = await res.text();
      if (text.includes("calendar__row") || text.includes("calendar__table") || text.includes("calendar__event")) {
        html = text;
        scraperMethod = "Jina Reader Engine";
      }
    }
  } catch (err: any) {
    console.warn(`[FF Scraper] Jina proxy fetch failed: ${err?.message}.`);
  }

  // Strategy 2: Direct ForexFactory fetch with standard browser headers
  if (!html) {
    try {
      const directRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (directRes.ok) {
        const text = await directRes.text();
        if (text.includes("calendar__row") || text.includes("calendar__table")) {
          html = text;
          scraperMethod = "Direct HTTP Fetch";
        }
      }
    } catch (err: any) {
      console.warn(`[FF Scraper] Direct fetch failed: ${err?.message}`);
    }
  }

  const elapsed = Date.now() - startTime;

  if (!html) {
    return {
      url: targetUrl,
      dateQueried: formattedDate,
      timestamp: new Date().toISOString(),
      totalEventsFound: 0,
      events: [],
      error: "Could not retrieve page content from ForexFactory (Cloudflare challenge active).",
      notes: "The scraper attempted multiple proxies and direct fetch, but ForexFactory returned bot protection.",
      latencyMs: elapsed,
      cached: false,
    };
  }

  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];

  let currentDate = formattedDate;
  let currentTime = "All Day";

  const rows = $("tr.calendar__row");

  rows.each((index, el) => {
    const $row = $(el);

    if ($row.hasClass("calendar__row--header") || $row.find("th").length > 0) {
      return;
    }

    const eventId = $row.attr("data-event-id") || $row.attr("data-eventid") || `evt_${index + 1}`;

    const dateText = $row.find(".calendar__date").text().trim();
    if (dateText) {
      currentDate = dateText;
    }

    const timeText = $row.find(".calendar__time").text().trim();
    if (timeText) {
      currentTime = timeText;
    }

    const currency = $row.find(".calendar__currency").text().trim().toUpperCase();

    const $impactCell = $row.find(".calendar__impact");
    let impactTitle = "";
    let impactClass = "";
    let impactLevel: ImpactLevel = "Low";

    const impactElements = $impactCell.add($impactCell.find("*"));
    impactElements.each((_, elem) => {
      const $elem = $(elem);
      const titleAttr = $elem.attr("title");
      const classAttr = $elem.attr("class");

      if (titleAttr && !impactTitle) {
        impactTitle = titleAttr.trim();
      }
      if (classAttr) {
        impactClass += ` ${classAttr}`;
      }
    });

    impactClass = impactClass.trim();

    const lowerTitle = impactTitle.toLowerCase();
    const lowerClass = impactClass.toLowerCase();

    if (
      lowerTitle.includes("high") ||
      lowerClass.includes("impact-red") ||
      lowerClass.includes("icon--ff-impact-red") ||
      lowerClass.includes("high") ||
      lowerClass.includes("red")
    ) {
      impactLevel = "High";
      if (!impactTitle) impactTitle = "High Impact Expected";
    } else if (
      lowerTitle.includes("medium") ||
      lowerClass.includes("impact-ora") ||
      lowerClass.includes("icon--ff-impact-ora") ||
      lowerClass.includes("medium") ||
      lowerClass.includes("ora") ||
      lowerClass.includes("orange")
    ) {
      impactLevel = "Medium";
      if (!impactTitle) impactTitle = "Medium Impact Expected";
    } else if (
      lowerTitle.includes("low") ||
      lowerClass.includes("impact-yel") ||
      lowerClass.includes("icon--ff-impact-yel") ||
      lowerClass.includes("low") ||
      lowerClass.includes("yel") ||
      lowerClass.includes("yellow")
    ) {
      impactLevel = "Low";
      if (!impactTitle) impactTitle = "Low Impact Expected";
    } else if (
      lowerTitle.includes("non") ||
      lowerTitle.includes("holiday") ||
      lowerClass.includes("impact-gra") ||
      lowerClass.includes("icon--ff-impact-gra") ||
      lowerClass.includes("holiday") ||
      lowerClass.includes("gray") ||
      lowerClass.includes("gra")
    ) {
      impactLevel = "Non-Economic";
      if (!impactTitle) impactTitle = "Non-Economic / Holiday";
    }

    const title = $row.find(".calendar__event-title").text().trim() || $row.find(".calendar__event").text().trim();

    if (!currency && !title) {
      return;
    }

    const detailId = $row.find(".calendar__detail-link").attr("data-event-id") || undefined;

    const $actualCell = $row.find(".calendar__actual");
    const actual = $actualCell.text().trim();
    const forecast = $row.find(".calendar__forecast").text().trim();
    const previous = $row.find(".calendar__previous").text().trim();

    let actualStatus: "better" | "worse" | "neutral" = "neutral";
    const actualCellClass = $actualCell.attr("class") || "";
    if (actualCellClass.includes("better") || $actualCell.find(".better").length > 0) {
      actualStatus = "better";
    } else if (actualCellClass.includes("worse") || $actualCell.find(".worse").length > 0) {
      actualStatus = "worse";
    }

    const rawRowData: string[] = [];
    $row.find("td").each((_, td) => {
      rawRowData.push($(td).text().trim());
    });

    events.push({
      id: eventId,
      date: currentDate || formattedDate,
      time: currentTime || "All Day",
      currency,
      impact: impactLevel,
      impactTitle,
      impactClass,
      title,
      detailId,
      actual,
      forecast,
      previous,
      actualStatus,
      rawRowData,
    });
  });

  const finalLatency = Date.now() - startTime;
  const result: ScrapeResult = {
    url: targetUrl,
    dateQueried: formattedDate,
    timestamp: new Date().toISOString(),
    totalEventsFound: events.length,
    events,
    rawHtmlLength: html.length,
    selectorUsed: "tr.calendar__row",
    notes: `Scraped via ${scraperMethod}. Attribute extraction active for element title tags.`,
    latencyMs: finalLatency,
    cached: false,
  };

  if (events.length > 0) {
    const todayStr = toUTCDateKey(Date.now());
    const isHistorical = formattedDate < todayStr;
    const ttlMs = isHistorical ? HISTORICAL_TTL : TODAY_TTL;

    scrapeCache.set(formattedDate, {
      data: result,
      expiresAt: Date.now() + ttlMs,
    });

    if (isHistorical) {
      writeDiskCache(formattedDate, result);
    }
  }

  return result;
}

// ------------------------------------------------------------
// Day-range scraping with bounded concurrency
// ------------------------------------------------------------

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  });
  await Promise.all(workers);
}

export async function scrapeDayRange(fromISO: string, toISO: string, maxDays: number = MAX_DAYS): Promise<ScrapeRangeResult> {
  const dayKeys = getDayKeysInRange(fromISO, toISO, maxDays);
  const errors: Record<string, string> = {};
  const results = new Map<string, ScrapeResult>();

  await runPool(dayKeys, CONCURRENCY, async (dayKey) => {
    try {
      results.set(dayKey, await scrapeForexFactory(dayKey));
    } catch (err: any) {
      errors[dayKey] = err?.message || String(err);
    }
  });

  const events: NewsEvent[] = [];
  const seen = new Set<string>();

  for (const dayKey of dayKeys) {
    const result = results.get(dayKey);
    if (!result) continue;
    for (const ev of result.events) {
      const dedupKey = `${dayKey}|${ev.id}|${ev.time}|${ev.title}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      events.push({
        id: `evt-${dayKey}-${ev.id}`,
        timestamp: buildEventTimestamp(dayKey, ev.time),
        currency: ev.currency.toUpperCase(),
        impact: ev.impactTitle || ev.impact,
        event: ev.title,
        actual: ev.actual,
        forecast: ev.forecast,
        previous: ev.previous,
        detail: "",
      });
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp);

  return { events, daysScraped: results.size, errors };
}
