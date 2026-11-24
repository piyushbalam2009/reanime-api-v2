import { MemoryCache } from "../cache/memory-cache.js";
import { env } from "../config/env.js";
import { ReAnimeScraper } from "../scraper/reanime.scraper.js";

export class ScraperService {
  private readonly scraper: ReAnimeScraper;
  private readonly cache = new MemoryCache();

  constructor(scraper = new ReAnimeScraper()) { this.scraper = scraper; }

  async search(query: string) {
    const key = `search:${query.toLowerCase()}`;
    const cached = this.cache.get<Awaited<ReturnType<ReAnimeScraper["search"]>>>(key);
    if (cached) return cached;
    const result = await this.scraper.search(query);
    this.cache.set(key, result, env.CACHE_TTL_SECONDS);
    return result;
  }

  async details(id: string) {
    const key = `details:${id}`;
    const cached = this.cache.get<Awaited<ReturnType<ReAnimeScraper["details"]>>>(key);
    if (cached) return cached;
    const result = await this.scraper.details(id);
    this.cache.set(key, result, env.CACHE_TTL_SECONDS);
    return result;
  }

  async episodes(id: string) {
    const key = `episodes:${id}`;
    const cached = this.cache.get<Awaited<ReturnType<ReAnimeScraper["episodes"]>>>(key);
    if (cached) return cached;
    const result = await this.scraper.episodes(id);
    this.cache.set(key, result, env.CACHE_TTL_SECONDS);
    return result;
  }

  close() { return this.scraper.close(); }
}
