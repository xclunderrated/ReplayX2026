import type { NewsEvent } from '../lib/news';

class NewsService {
  private cache = new Map<string, Promise<NewsEvent[]>>();

  async fetch(instrument: string, from: string, to: string): Promise<NewsEvent[]> {
    const key = `${instrument}|${from}|${to}`;
    const pending = this.cache.get(key);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`/api/news?instrument=${encodeURIComponent(instrument)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch news: ${response.statusText} (Status: ${response.status})`);
          }
          const data = await response.json();
          return (data.events || []) as NewsEvent[];
        } catch (err: any) {
          lastError = err;
          console.warn(`[NewsService] Fetch attempt ${attempt} failed:`, err);
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
      console.error('[NewsService] All fetch news attempts failed:', lastError);
      return [] as NewsEvent[];
    })();

    this.cache.set(key, promise);

    try {
      return await promise;
    } finally {
      this.cache.delete(key);
    }
  }
}

export const newsService = new NewsService();
