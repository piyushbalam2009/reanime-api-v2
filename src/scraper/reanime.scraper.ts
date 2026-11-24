import type { CheerioAPI } from "cheerio";
import { env } from "../config/env.js";
import type { AnimeDetails, AnimeSummary, Episode } from "../types/index.js";
import { absoluteUrl, normalizeId } from "../utils/url.js";
import { HttpTransport } from "./transport.js";

export class ReAnimeScraper {
  private readonly transport: HttpTransport;

  constructor(transport = new HttpTransport()) {
    this.transport = transport;
  }

  private url(path: string): string { return new URL(path, env.REANIME_BASE_URL).toString(); }

  private parseCards($: CheerioAPI): AnimeSummary[] {
    const results: AnimeSummary[] = [];
    const seen = new Set<string>();
    const baseHost = new URL(env.REANIME_BASE_URL).hostname;
    $("a[href]").each((_index, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      const title = (anchor.attr("title") || anchor.text()).replace(/\s+/g, " ").trim();
      if (!href || !title || title.length < 2) return;
      const url = absoluteUrl(href, env.REANIME_BASE_URL);
      if (!url) return;
      const hostname = new URL(url).hostname;
      if (hostname !== baseHost && !hostname.endsWith("." + baseHost)) return;
      const image = absoluteUrl(anchor.find("img").first().attr("data-src") || anchor.find("img").first().attr("src"), env.REANIME_BASE_URL);
      const id = normalizeId(new URL(url).pathname.split("/").filter(Boolean).at(-1) || "");
      if (!id || seen.has(id) || !/(anime|watch|series)/i.test(url)) return;
      seen.add(id);
      results.push({ id, title, url, ...(image ? { image } : {}) });
    });
    return results;
  }

  async search(query: string): Promise<AnimeSummary[]> {
    const $ = await this.transport.html(this.url("/?s=" + encodeURIComponent(query)));
    return this.parseCards($);
  }

  async details(id: string): Promise<AnimeDetails> {
    const url = this.url("/anime/" + encodeURIComponent(id));
    const $ = await this.transport.html(url);
    const title = $("h1").first().text().trim() || $("title").text().trim();
    if (!title) throw new Error("Anime not found or page structure changed: " + id);
    const description = $('[class*="description"], [class*="synopsis"], .entry-content').first().text().trim();
    const image = absoluteUrl($("meta[property='og:image']").attr("content") || $("img").first().attr("src"), env.REANIME_BASE_URL);
    const genres = $("a[href*='genre']").map((_i, el) => $(el).text().trim()).get().filter(Boolean);
    return {
      id, title, url,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      ...(genres.length ? { genres: [...new Set(genres)] } : {})
    };
  }

  async episodes(id: string): Promise<Episode[]> {
    const url = this.url("/anime/" + encodeURIComponent(id));
    const $ = await this.transport.html(url);
    const episodes: Episode[] = [];
    const seen = new Set<string>();
    $("a[href]").each((_i, el) => {
      const a = $(el);
      const href = a.attr("href");
      const label = (a.text() + " " + (a.attr("title") || "")).trim();
      const match = label.match(/(?:episode|ep)\s*[-:#.]?\s*(\d+(?:\.\d+)?)/i)
        || href?.match(/(?:episode|ep)[-/]?(\d+(?:\.\d+)?)/i);
      if (!href || !match) return;
      const number = Number(match[1]);
      const episodeUrl = absoluteUrl(href, env.REANIME_BASE_URL);
      if (!Number.isFinite(number) || !episodeUrl || seen.has(episodeUrl)) return;
      seen.add(episodeUrl);
      const fallbackId = id + "-" + number;
      const idValue = normalizeId(new URL(episodeUrl).pathname.split("/").filter(Boolean).at(-1) || fallbackId);
      const title = a.text().trim();
      episodes.push({ id: idValue, number, ...(title ? { title } : {}), url: episodeUrl });
    });
    return episodes.sort((a, b) => a.number - b.number);
  }

  async close(): Promise<void> { await this.transport.close(); }
}
