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

  /**
   * Re:ANIME's catalog uses /anime/{slug} links for actual anime cards.
   * Do not scan every page link: navigation, language and filter links are
   * also present and were previously being returned as false anime results.
   */
  private parseCards($: CheerioAPI): AnimeSummary[] {
    const results: AnimeSummary[] = [];
    const seen = new Set<string>();

    $('a[href^="/anime/"], a[href*="/anime/"]').each((_index, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      if (!href) return;

      const url = absoluteUrl(href, env.REANIME_BASE_URL);
      if (!url) return;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return;
      }

      const baseHost = new URL(env.REANIME_BASE_URL).hostname;
      if (parsedUrl.hostname !== baseHost && !parsedUrl.hostname.endsWith("." + baseHost)) return;

      // Only accept a single anime slug after /anime/, not generic /anime pages.
      const match = parsedUrl.pathname.match(/^\/anime\/([^/]+)\/?$/i);
      if (!match) return;

      const id = normalizeId(decodeURIComponent(match[1] ?? ""));
      if (!id || seen.has(id)) return;

      const imageElement = anchor.find("img").first();
      const image = absoluteUrl(
        imageElement.attr("data-src") || imageElement.attr("data-lazy-src") || imageElement.attr("src"),
        env.REANIME_BASE_URL
      );
      const title = (
        anchor.find("h1,h2,h3,h4,[class*='anime-title'],[class*='title']").first().text()
        || imageElement.attr("alt")
        || anchor.attr("title")
        || ""
      ).replace(/\s+/g, " ").trim();

      // An actual catalog card should have a meaningful title. Ignore
      // buttons, icon links, empty placeholders and global navigation.
      if (!title || title.length < 2 || /^(watch now|view schedule|home|search)$/i.test(title)) return;

      seen.add(id);
      results.push({ id, title, url: parsedUrl.toString(), ...(image ? { image } : {}) });
    });

    return results;
  }

  async search(query: string): Promise<AnimeSummary[]> {
    // The current Re:ANIME catalog search route is /search?q=..., not the
    // old WordPress-style /?s=... route (which returns the homepage).
    const url = this.url("/search?q=" + encodeURIComponent(query));
    const $ = await this.transport.html(url);
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
