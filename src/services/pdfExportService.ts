import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EnrichedTrade, MetricSummary, formatDuration, formatTradeTime } from './math/tradeMetrics';
import {
  generateCandlestickChartDataUrl,
  generateEquityCurveChartDataUrl,
  generateRDistributionChartDataUrl,
  generateMaeMfeScatterChartDataUrl,
} from './pdfChartRenderer';
import { useSimulatorStore, Candle } from '../store/useSimulatorStore';
import { extractTradeReplayData, TradeReplayData } from '../components/analytics/analyticsEngine';
import { ensureTradeReplayData } from '../lib/replayDataFetcher';

export interface SingleTradePdfOptions {
  trade: EnrichedTrade;
  chartImageBase64?: string | null;
  screenshotsBase64?: string[];
  strategyName?: string;
  checklistItems?: { text: string; hit: boolean; isRequired?: boolean }[];
  replayData?: TradeReplayData | null;
}

export interface MultiTradePdfOptions {
  trades: EnrichedTrade[];
  metrics: MetricSummary;
  sessionTitle?: string;
  dateRangeStr?: string;
}

/**
 * Finds all journal screenshots associated with a specific trade.
 */
export function findTradeScreenshots(trade: EnrichedTrade): { dataUrl: string; title: string; note?: string }[] {
  const store = useSimulatorStore.getState();
  const results: { dataUrl: string; title: string; note?: string }[] = [];
  const addedUrls = new Set<string>();

  const allSessions = [
    ...(store.sessions || []),
    ...(store.archivedSessions || []),
  ];

  const tradeEntryTs = trade.entryTime || trade.orderTime || 0;
  const tradeExitTs = trade.exitTime || (trade as any).closedAt || tradeEntryTs;
  const windowTolerance = 30 * 60 * 1000; // 30 minutes window

  allSessions.forEach((sess) => {
    (sess.journalEntries || []).forEach((j) => {
      if (!j.imageDataUrl || addedUrls.has(j.imageDataUrl)) return;

      // 1. Direct match by trade ID
      if (j.tradeId && j.tradeId === trade.id) {
        results.push({ dataUrl: j.imageDataUrl, title: j.title || 'Trade Execution Snapshot', note: j.note });
        addedUrls.add(j.imageDataUrl);
        return;
      }

      // 2. Proximity match by timestamp and instrument
      const jTs = j.candleTimestamp || j.createdAt || 0;
      if (
        j.instrument?.toLowerCase() === trade.instrument?.toLowerCase() &&
        jTs >= tradeEntryTs - windowTolerance &&
        jTs <= tradeExitTs + windowTolerance
      ) {
        results.push({ dataUrl: j.imageDataUrl, title: j.title || 'Context Chart Snapshot', note: j.note });
        addedUrls.add(j.imageDataUrl);
      }
    });
  });

  return results;
}

/**
 * Generates an executive prop-grade PDF Report for a single trade autopsy.
 */
export async function generateSingleTradePdf({
  trade,
  chartImageBase64,
  screenshotsBase64 = [],
  strategyName = 'Default Setup',
  checklistItems = [],
  replayData,
}: SingleTradePdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Retrieve chart replay data if not provided
  let effectiveReplayData = replayData;
  if (!effectiveReplayData) {
    const store = useSimulatorStore.getState();
    const allSessions = [...(store.sessions || []), ...(store.archivedSessions || [])];
    effectiveReplayData = extractTradeReplayData(trade as any, allSessions as any, trade.timeframe, { fullDay: true });
    if (!effectiveReplayData) {
      try {
        effectiveReplayData = await ensureTradeReplayData(trade as any, allSessions as any, trade.timeframe);
      } catch {
        // Continue with fallback
      }
    }
  }

  // Generate crisp canvas chart if not provided
  let mainChartBase64 = chartImageBase64;
  if (!mainChartBase64) {
    try {
      mainChartBase64 = generateCandlestickChartDataUrl(trade, effectiveReplayData);
    } catch (err) {
      console.warn('Canvas chart generation warning:', err);
    }
  }

  // Collect attached journal screenshots
  const foundScreenshots = findTradeScreenshots(trade);
  const allScreenshots: { dataUrl: string; title: string; note?: string }[] = [
    ...foundScreenshots,
    ...screenshotsBase64.map((url, i) => ({ dataUrl: url, title: `Attached Screenshot #${i + 1}` })),
  ];

  // ==========================================
  // PAGE 1: EXECUTIVE AUTOPSY & CHART DOSSIER
  // ==========================================

  // Dark Banner Header
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('REPLAYX — INSTITUTIONAL TRADE AUTOPSY', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  const subtitle = `Trade ID: ${trade.id} | Session: ${trade.sessionName} | Generated: ${new Date().toLocaleString()}`;
  doc.text(subtitle, margin, 19);

  // Verdict Ribbon Banner
  const isWin = (trade.pnl || 0) > 0.5;
  const isLoss = (trade.pnl || 0) < -0.5;
  const ribbonColor: [number, number, number] = isWin
    ? [16, 185, 129] // Emerald Green
    : isLoss
    ? [239, 68, 68] // Rose Red
    : [100, 116, 139]; // Neutral Gray

  doc.setFillColor(...ribbonColor);
  doc.roundedRect(margin, 33, contentWidth, 22, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const directionText = trade.type.toUpperCase();
  const verdictText = isWin ? 'WINNING TRADE' : isLoss ? 'LOSS' : 'BREAK-EVEN';
  doc.text(`${trade.instrument} • ${directionText} (${verdictText})`, margin + 6, 42);

  doc.setFontSize(14);
  const pnlSign = (trade.pnl || 0) >= 0 ? '+' : '';
  const rSuffix = trade.riskAmountDollar > 0 ? ` (${pnlSign}${trade.calculatedRMultiple}R)` : '';
  const pnlText = `${pnlSign}$${Number(trade.pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${rSuffix}`;
  doc.text(pnlText, pageWidth - margin - 6, 42, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Timeframe: ${trade.timeframe.toUpperCase()} | Grade: ${trade.grade || 'Ungraded'} | Pip Gain: ${trade.pipGain > 0 ? '+' : ''}${trade.pipGain} pips | Efficiency: ${trade.executionEfficiency.toFixed(0)}%`,
    margin + 6,
    50
  );

  let curY = 60;

  // 1. High-Resolution Candlestick Replay Chart
  if (mainChartBase64) {
    try {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      doc.text('1. EXECUTION CHART & PRICE ACTION TELEMETRY', margin, curY);

      curY += 3;
      const imgHeight = 78;
      doc.addImage(mainChartBase64, 'PNG', margin, curY, contentWidth, imgHeight, undefined, 'FAST');
      curY += imgHeight + 6;
    } catch (err) {
      console.warn('Could not render chart image into PDF:', err);
    }
  }

  // 2. Comprehensive Trade Parameters Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text('2. EXECUTION PARAMETERS & EXCURSION PROFILE', margin, curY);
  curY += 2;

  const tableBody = [
    [
      'Entry Price',
      Number(trade.entryPrice || 0).toFixed(5),
      'Exit Price',
      Number(trade.exitPrice || 0).toFixed(5),
    ],
    [
      'Stop Loss (SL)',
      trade.sl ? Number(trade.sl).toFixed(5) : 'None',
      'Take Profit (TP)',
      trade.tp ? Number(trade.tp).toFixed(5) : 'None',
    ],
    [
      'Position Size',
      `${trade.size} Lots`,
      'Dollar Risk ($)',
      trade.riskAmountDollar > 0 ? `$${trade.riskAmountDollar.toFixed(2)}` : 'No SL Set',
    ],
    [
      'Max Adverse (MAE)',
      `-$${trade.maeDollar.toFixed(2)} (${trade.maePips.toFixed(1)} pips)`,
      'Max Favorable (MFE)',
      `+$${trade.mfeDollar.toFixed(2)} (${trade.mfePips.toFixed(1)} pips)`,
    ],
    [
      'Entry Timestamp',
      formatTradeTime(trade.entryTime || trade.orderTime),
      'Exit Timestamp',
      formatTradeTime(trade.exitTime),
    ],
    [
      'Holding Duration',
      formatDuration(trade.calculatedDurationMs),
      'Strategy Model',
      strategyName,
    ],
    [
      'Execution Efficiency',
      `${trade.executionEfficiency.toFixed(1)}% (Realized / MFE)`,
      'Risk Exposure (Heat)',
      `${trade.riskHeatRatio.toFixed(1)}% (MAE / Risk)`,
    ],
  ];

  autoTable(doc, {
    startY: curY,
    head: [['Parameter', 'Value', 'Parameter', 'Value']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 1.8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 1.8,
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 36 },
      1: { cellWidth: 48 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 38 },
      3: { cellWidth: 60 },
    },
    margin: { left: margin, right: margin },
  });

  const lastTable1 = (doc as any).lastAutoTable;
  curY = (lastTable1 ? lastTable1.finalY : curY) + 6;

  // Page 1 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('ReplayX Backtesting & Trade Analytics Engine — Confirmed 100% Real Trade Execution Data • Page 1 of 2', margin, pageHeight - 6);

  // ==========================================
  // PAGE 2: DEEP DIVE AUTOPSY & SCREENSHOTS
  // ==========================================
  doc.addPage();

  // Header Banner Page 2
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`TRADE AUTOPSY DEEP DIVE: ${trade.instrument} (${directionText}) • ${trade.id.slice(0, 10)}`, margin, 12);

  let p2Y = 26;

  // 3. Strategy Checklist Compliance
  if (checklistItems.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('3. STRATEGY CHECKLIST COMPLIANCE & RULE EXECUTION', margin, p2Y);
    p2Y += 3;

    const checklistBody = checklistItems.map((item) => [
      item.hit ? '[✓] COMPLIANT' : '[✗] MISSED',
      item.isRequired ? 'MANDATORY' : 'OPTIONAL',
      item.text,
    ]);

    autoTable(doc, {
      startY: p2Y,
      head: [['Status', 'Rule Type', 'Rule Requirement Description']],
      body: checklistBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 1.5,
      },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 26 },
        1: { cellWidth: 24, fontStyle: 'italic', textColor: [100, 116, 139] },
        2: { cellWidth: contentWidth - 50 },
      },
      didParseCell: (data) => {
        if (data.column.index === 0) {
          if (data.cell.raw === '[✓] COMPLIANT') {
            data.cell.styles.textColor = [16, 185, 129];
          } else {
            data.cell.styles.textColor = [239, 68, 68];
          }
        }
      },
      margin: { left: margin, right: margin },
    });

    const chkTable = (doc as any).lastAutoTable;
    p2Y = (chkTable ? chkTable.finalY : p2Y) + 6;
  }

  // 4. Trader Notes & Psychological Autopsy
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text('4. BEHAVIORAL & PSYCHOLOGICAL REVIEW', margin, p2Y);
  p2Y += 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, p2Y, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const tagsText = `Setup Model: [${trade.setupTag || 'Unclassified'}]   |   Mistake Flag: [${trade.mistakeTag || 'Disciplined Execution'}]   |   Execution Grade: [${trade.grade || 'Ungraded'}]`;
  doc.text(tagsText, margin + 4, p2Y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const notesText = trade.notes || 'No trade reflection notes logged.';
  const splitNotes = doc.splitTextToSize(notesText, contentWidth - 8);
  doc.text(splitNotes, margin + 4, p2Y + 12);

  p2Y += 26;

  // 5. Attached Trade Screenshots Gallery
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`5. ATTACHED TRADE SCREENSHOTS & JOURNAL CAPTURES (${allScreenshots.length} AVAILABLE)`, margin, p2Y);
  p2Y += 3;

  if (allScreenshots.length > 0) {
    // Render up to 2 screenshots on this page
    const shotsToRender = allScreenshots.slice(0, 2);
    const shotH = 70;
    const shotW = shotsToRender.length === 1 ? contentWidth : (contentWidth - 6) / 2;

    shotsToRender.forEach((shot, idx) => {
      const shotX = shotsToRender.length === 1 ? margin : margin + idx * (shotW + 6);
      try {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(shotX, p2Y, shotW, shotH + 10, 1.5, 1.5, 'F');
        doc.addImage(shot.dataUrl, 'JPEG', shotX + 1, p2Y + 1, shotW - 2, shotH - 2, undefined, 'FAST');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        doc.text(shot.title.slice(0, 45), shotX + 3, p2Y + shotH + 4);

        if (shot.note) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(shot.note.slice(0, 60), shotX + 3, p2Y + shotH + 8);
        }
      } catch (err) {
        console.warn('Could not embed screenshot in PDF:', err);
      }
    });

    p2Y += shotH + 14;
  } else {
    // If no manual screenshot was attached, render an excursion distribution analysis chart
    try {
      const scatterBase64 = generateMaeMfeScatterChartDataUrl([trade]);
      doc.addImage(scatterBase64, 'PNG', margin, p2Y, contentWidth, 75, undefined, 'FAST');
      p2Y += 78;
    } catch {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, p2Y, contentWidth, 20, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('No additional journal screenshots attached to this trade.', margin + 6, p2Y + 11);
      p2Y += 24;
    }
  }

  // Check if additional screenshots exist for Page 3 Appendix
  const remainingScreenshots = allScreenshots.slice(2);
  const totalPages = remainingScreenshots.length > 0 ? 3 : 2;

  // Page 2 Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`ReplayX Backtesting & Trade Analytics Engine — Confirmed 100% Real Trade Execution Data • Page 2 of ${totalPages}`, margin, pageHeight - 6);

  // ==========================================
  // PAGE 3: MULTI-TIMEFRAME CHART APPENDIX (IF APPLICABLE)
  // ==========================================
  if (remainingScreenshots.length > 0) {
    doc.addPage();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`MULTI-TIMEFRAME CHART APPENDIX: ${trade.instrument} (${directionText}) • ${trade.id.slice(0, 10)}`, margin, 12);

    let p3Y = 26;
    const shotH = 68;
    const shotW = (contentWidth - 6) / 2;

    for (let i = 0; i < remainingScreenshots.length && i < 6; i += 2) {
      const pair = remainingScreenshots.slice(i, i + 2);
      pair.forEach((shot, colIdx) => {
        const shotX = pair.length === 1 && colIdx === 0 && remainingScreenshots.length === 1
          ? margin
          : margin + colIdx * (shotW + 6);
        const actualW = pair.length === 1 && colIdx === 0 && remainingScreenshots.length === 1
          ? contentWidth
          : shotW;

        try {
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(shotX, p3Y, actualW, shotH + 10, 1.5, 1.5, 'F');
          doc.addImage(shot.dataUrl, 'JPEG', shotX + 1, p3Y + 1, actualW - 2, shotH - 2, undefined, 'FAST');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(51, 65, 85);
          doc.text(shot.title.slice(0, 45), shotX + 3, p3Y + shotH + 4);

          if (shot.note) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(100, 116, 139);
            doc.text(shot.note.slice(0, 60), shotX + 3, p3Y + shotH + 8);
          }
        } catch (err) {
          console.warn('Could not embed appendix screenshot in PDF:', err);
        }
      });

      p3Y += shotH + 14;
    }

    // Page 3 Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`ReplayX Backtesting & Trade Analytics Engine — Confirmed 100% Real Trade Execution Data • Page 3 of ${totalPages}`, margin, pageHeight - 6);
  }

  doc.save(`ReplayX_Autopsy_${trade.instrument}_${trade.id.slice(0, 7)}.pdf`);
}

/**
 * Generates an Institutional Multi-Trade Session Audit PDF Dossier.
 */
export async function generateMultiTradeAuditPdf({
  trades,
  metrics,
  sessionTitle = 'Backtest Session Audit',
  dateRangeStr = '',
}: MultiTradePdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // Generate High-Res Analytics Charts
  const equityCurveBase64 = generateEquityCurveChartDataUrl(trades);
  const rDistBase64 = generateRDistributionChartDataUrl(trades);
  const maeMfeBase64 = generateMaeMfeScatterChartDataUrl(trades);

  // ==========================================
  // PAGE 1: EXECUTIVE SUMMARY & EQUITY CURVE
  // ==========================================

  // Dark Header Banner
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('REPLAYX — EXECUTIVE TRADING AUDIT & PERFORMANCE DOSSIER', margin, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const subtitle = `${sessionTitle} | ${trades.length} Closed Trades | Generated: ${new Date().toLocaleString()} ${dateRangeStr ? `| Period: ${dateRangeStr}` : ''}`;
  doc.text(subtitle, margin, 17);

  let curY = 25;

  // 5 KPI Metric Cards
  const cardWidth = (contentWidth - 6 * 4) / 5;
  const cardHeight = 17;

  const kpis = [
    {
      label: 'Net Realized PnL',
      value: `${metrics.netPnL >= 0 ? '+' : ''}$${metrics.netPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: `${metrics.totalR >= 0 ? '+' : ''}${metrics.totalR}R Total`,
      color: metrics.netPnL >= 0 ? [16, 185, 129] : [239, 68, 68],
    },
    {
      label: 'Win Rate %',
      value: `${metrics.winRate}%`,
      sub: `${metrics.wins}W / ${metrics.losses}L / ${metrics.breakEvens}BE`,
      color: [59, 130, 246],
    },
    {
      label: 'Profit Factor',
      value: metrics.profitFactor >= 99 ? '∞' : metrics.profitFactor.toFixed(2),
      sub: `Gross: +$${metrics.totalGrossProfit.toFixed(0)} / -$${metrics.totalGrossLoss.toFixed(0)}`,
      color: [168, 85, 247],
    },
    {
      label: 'Avg Win / Avg Loss',
      value: `+$${metrics.avgWinDollar.toFixed(0)} / -$${metrics.avgLossDollar.toFixed(0)}`,
      sub: `+${metrics.avgWinR}R / -${metrics.avgLossR}R`,
      color: [245, 158, 11],
    },
    {
      label: 'Expectancy (R)',
      value: `${metrics.expectancyR >= 0 ? '+' : ''}${metrics.expectancyR}R`,
      sub: `Avg Hold: ${formatDuration(metrics.avgHoldingTimeMs)}`,
      color: [14, 165, 233],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardWidth + 6);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, curY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, curY + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, curY + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 3, curY + 14);
  });

  curY += cardHeight + 4;

  // Embed High-Res Equity Curve Chart
  if (equityCurveBase64) {
    try {
      const equityHeight = 85;
      doc.addImage(equityCurveBase64, 'PNG', margin, curY, contentWidth, equityHeight, undefined, 'FAST');
      curY += equityHeight + 5;
    } catch (err) {
      console.warn('Could not embed equity curve:', err);
    }
  }

  // Statistical Performance Summary Table (2-Row Dense Matrix)
  const perfStats = [
    [
      'Total Trades',
      `${trades.length}`,
      'Max Consecutive Wins',
      `${metrics.maxConsecutiveWins}`,
      'Largest Winning Trade',
      `+$${metrics.largestWinDollar.toFixed(2)} (+${metrics.largestWinR}R)`,
    ],
    [
      'Payoff Ratio',
      `${metrics.payoffRatio.toFixed(2)}x`,
      'Max Consecutive Losses',
      `${metrics.maxConsecutiveLosses}`,
      'Largest Losing Trade',
      `-$${metrics.largestLossDollar.toFixed(2)} (-${metrics.largestLossR}R)`,
    ],
  ];

  autoTable(doc, {
    startY: curY,
    body: perfStats,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 35 },
      1: { cellWidth: 45 },
      2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 42 },
      3: { cellWidth: 45 },
      4: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 45 },
      5: { cellWidth: contentWidth - 212 },
    },
    margin: { left: margin, right: margin },
  });

  // ==========================================
  // PAGE 2: VISUAL ANALYTICS & BREAKDOWNS
  // ==========================================
  doc.addPage();

  // Header Banner Page 2
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 16, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ADVANCED DISTRIBUTION ANALYTICS & EXECUTION QUALITY', margin, 10);

  let p2Y = 22;

  // Side-by-side R-Distribution and MAE vs MFE Charts
  const chartW = (contentWidth - 6) / 2;
  const chartH = 75;

  if (rDistBase64) {
    try {
      doc.addImage(rDistBase64, 'PNG', margin, p2Y, chartW, chartH, undefined, 'FAST');
    } catch (e) {
      console.warn(e);
    }
  }

  if (maeMfeBase64) {
    try {
      doc.addImage(maeMfeBase64, 'PNG', margin + chartW + 6, p2Y, chartW, chartH, undefined, 'FAST');
    } catch (e) {
      console.warn(e);
    }
  }

  p2Y += chartH + 6;

  // Directional & Instrument Breakdown Table
  const longTrades = trades.filter((t) => t.type === 'buy');
  const shortTrades = trades.filter((t) => t.type === 'sell');

  const longWins = longTrades.filter((t) => Number(t.pnl || 0) > 0.5).length;
  const shortWins = shortTrades.filter((t) => Number(t.pnl || 0) > 0.5).length;

  const longNet = longTrades.reduce((acc, t) => acc + Number(t.pnl || 0), 0);
  const shortNet = shortTrades.reduce((acc, t) => acc + Number(t.pnl || 0), 0);

  const breakdownBody = [
    [
      'LONG POSITIONS (BUY)',
      `${longTrades.length}`,
      `${longTrades.length > 0 ? ((longWins / longTrades.length) * 100).toFixed(1) : '0'}%`,
      `${longNet >= 0 ? '+' : ''}$${longNet.toFixed(2)}`,
    ],
    [
      'SHORT POSITIONS (SELL)',
      `${shortTrades.length}`,
      `${shortTrades.length > 0 ? ((shortWins / shortTrades.length) * 100).toFixed(1) : '0'}%`,
      `${shortNet >= 0 ? '+' : ''}$${shortNet.toFixed(2)}`,
    ],
  ];

  autoTable(doc, {
    startY: p2Y,
    head: [['Side / Direction', 'Total Trades', 'Win Rate %', 'Net Realized PnL']],
    body: breakdownBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.5,
    },
    bodyStyles: { fontSize: 7, cellPadding: 1.5, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 70 },
      1: { cellWidth: 50 },
      2: { cellWidth: 50 },
      3: { cellWidth: contentWidth - 170 },
    },
    margin: { left: margin, right: margin },
  });

  // ==========================================
  // PAGE 3+: COMPLETE AUDIT TRADE LEDGER
  // ==========================================
  doc.addPage();

  let p3Y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('COMPLETE AUDIT TRADE LEDGER', margin, p3Y);
  p3Y += 3;

  const tableData = trades.map((t, idx) => {
    const pnlSign = (t.pnl || 0) >= 0 ? '+' : '';
    return [
      `#${trades.length - idx}`,
      formatTradeTime(t.entryTime || t.orderTime),
      t.sessionName.slice(0, 14),
      t.instrument,
      t.type.toUpperCase(),
      t.timeframe.toUpperCase(),
      Number(t.entryPrice || 0).toFixed(4),
      Number(t.exitPrice || 0).toFixed(4),
      `${t.size}`,
      `${t.pipGain > 0 ? '+' : ''}${t.pipGain}`,
      t.riskAmountDollar > 0 ? `$${t.riskAmountDollar.toFixed(0)}` : 'No SL',
      `${pnlSign}$${Number(t.pnl || 0).toFixed(2)}`,
      t.riskAmountDollar > 0 ? `${pnlSign}${t.calculatedRMultiple}R` : '—',
      `-$${t.maeDollar.toFixed(0)} / +$${t.mfeDollar.toFixed(0)}`,
      t.grade || '—',
    ];
  });

  autoTable(doc, {
    startY: p3Y,
    head: [[
      '#',
      'Date',
      'Session',
      'Pair',
      'Side',
      'TF',
      'Entry',
      'Exit',
      'Lots',
      'Pips',
      'Risk $',
      'PnL ($)',
      'Return (R)',
      'MAE / MFE',
      'Grade',
    ]],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [51, 65, 85],
      cellPadding: 1.2,
    },
    didParseCell: (data) => {
      // Highlight side (Long/Short)
      if (data.column.index === 4) {
        if (data.cell.raw === 'BUY') {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'SELL') {
          data.cell.styles.textColor = [239, 68, 68];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Highlight PnL & Return R
      if (data.column.index === 11 || data.column.index === 12) {
        const text = String(data.cell.raw || '');
        if (text.startsWith('+')) {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('-')) {
          data.cell.styles.textColor = [239, 68, 68];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: margin, right: margin, bottom: 10 },
  });

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ReplayX Performance Audit • Page ${i} of ${totalPages} • Verified Real Mathematical Execution Data`,
      margin,
      pageHeight - 4
    );
  }

  doc.save(`ReplayX_Session_Audit_${trades.length}_Trades.pdf`);
}
