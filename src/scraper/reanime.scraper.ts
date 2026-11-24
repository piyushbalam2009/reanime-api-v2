import type { CheerioAPI } from "cheerio";
import { env } from "../config/env.js";
import type { AnimeDetails, AnimeSummary, Episode } from "../types/index.js";
import { absoluteUrl, normalizeId } from "../utils/url.js";
import { HttpTransport } from "./transport.js";

function clean(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function textAfterLabel(text: string, label: string, nextLabels: string[]): string | undefined {
  const start = text.toLowerCase().indexOf(label.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + label.length;
  let end = text.length;
  for (const next of nextLabels) {
    const index = text.toLowerCase().indexOf(next.toLowerCase(), valueStart);
    if (index >= 0 && index < end) end = index;
  }
  const value = clean(text.slice(valueStart, end).replace(/^[:\s]+/, ""));
  return value || undefined;
}

export class ReAnimeScraper {
  private readonly transport: HttpTransport;

  constructor(transport = new HttpTransport()) { this.transport = transport; }

  private url(path: string): string { return new URL(path, env.REANIME_BASE_URL).toString(); }

  private parseCards($: CheerioAPI): AnimeSummary[] {
    const results: AnimeSummary[] = [];
    const seen = new Set<string>();
    const baseHost = new URL(env.REANIME_BASE_URL).hostname;
    $('a[href^="/anime/"], a[href*="/anime/"]').each((_index, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      if (!href) return;
      const url = absoluteUrl(href, env.REANIME_BASE_URL);
      if (!url) return;
      let parsedUrl: URL;
      try { parsedUrl = new URL(url); } catch { return; }
      if (parsedUrl.hostname !== baseHost && !parsedUrl.hostname.endsWith("." + baseHost)) return;
      const match = parsedUrl.pathname.match(/^\/anime\/([^/]+)\/?$/i);
      if (!match?.[1]) return;
      const id = normalizeId(decodeURIComponent(match[1]));
      if (!id || seen.has(id)) return;
      const imageElement = anchor.find("img").first();
      const image = absoluteUrl(imageElement.attr("data-src") || imageElement.attr("data-lazy-src") || imageElement.attr("src"), env.REANIME_BASE_URL);
      const title = clean(
        anchor.find('h1,h2,h3,h4,[class*="anime-title"],[class*="title"]').first().text()
        || imageElement.attr("alt") || anchor.attr("title")
      );
      if (!title || title.length < 2 || /^(watch now|view schedule|home|search)$/i.test(title)) return;
      seen.add(id);
      results.push({ id, title, url: parsedUrl.toString(), ...(image ? { image } : {}) });
    });
    return results;
  }

  async search(query: string): Promise<AnimeSummary[]> {
    const $ = await this.transport.html(this.url("/search?q=" + encodeURIComponent(query)));
    return this.parseCards($);
  }

  async details(id: string): Promise<AnimeDetails> {
    const url = this.url("/anime/" + encodeURIComponent(id));
    const $ = await this.transport.html(url);
    const title = clean($("main h1").first().text() || $("h1").first().text() || $("title").text());
    if (!title || /not found|404/i.test(title)) throw new Error("Anime not found: " + id);
    const image = absoluteUrl(
      $("meta[property='og:image']").attr("content")
      || $("main img[alt]").first().attr("src")
      || $("main img[alt]").first().attr("data-src"),
      env.REANIME_BASE_URL
    );
    const description = clean(
      $("main [class*='synopsis'], main [class*='description'], main [class*='overview']").first().text()
      || $("meta[name='description']").attr("content")
    );
    const alternateTitle = clean($("main h1").first().nextAll("h2,h3").first().text());
    const genres = $("a[href*='/genre/'], a[href*='/genres/']").map((_i, el) => clean($(el).text())).get().filter(Boolean);
    const bodyText = clean($("main").text() || $("body").text());
    const status = textAfterLabel(bodyText, "Status", ["Start Date", "Season", "External Links", "Genres", "Premiered"]);
    const format = textAfterLabel(bodyText, "Format", ["Source", "Tags", "Rate this anime", "Studios"]);
    const score = bodyText.match(/(?:Score|Rating)\s*:?\s*(\d+(?:\.\d+)?)/i)?.[1];
    const episodeCount = bodyText.match(/Episodes\s*:?\s*(\d+)/i)?.[1];
    const premiered = bodyText.match(/Premiered\s*:?\s*(Winter|Spring|Summer|Fall)\s+(\d{4})/i);
    const year = bodyText.match(/Start Date\s*:?\s*(\d{4})[-./]/i)?.[1] || bodyText.match(/Aired\s*:?\s*(\d{4})/i)?.[1];
    return {
      id, title, url,
      ...(image ? { image } : {}),
      ...(description ? { description } : {}),
      ...(alternateTitle && alternateTitle !== title ? { alternativeTitles: [alternateTitle] } : {}),
      ...(genres.length ? { genres: [...new Set(genres)] } : {}),
      ...(status ? { status } : {}),
      ...(format ? { type: format } : {}),
      ...(score ? { rating: score } : {}),
      ...(episodeCount ? { episodes: Number(episodeCount) } : {}),
      ...(premiered ? { season: premiered[1] + " " + premiered[2] } : {}),
      ...(year ? { releaseYear: Number(year) } : {})
    };
  }

  async episodes(id: string): Promise<Episode[]> {
    const watchUrl = this.url("/watch/" + encodeURIComponent(id));
    const $ = await this.transport.html(watchUrl);
    const episodes: Episode[] = [];
    const seen = new Set<number>();

    $('a[href*="/watch/"][href*="ep="], a[href*="?ep="], a[href*="&ep="]').each((_index, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      if (!href) return;
      const absolute = absoluteUrl(href, env.REANIME_BASE_URL);
      if (!absolute) return;
      let parsed: URL;
      try { parsed = new URL(absolute); } catch { return; }
      if (parsed.hostname !== new URL(env.REANIME_BASE_URL).hostname) return;
      const number = Number(parsed.searchParams.get("ep"));
      if (!Number.isSafeInteger(number) || number < 1 || seen.has(number)) return;
      const rawText = clean(anchor.text() || anchor.attr("title"));
      const title = clean(rawText.replace(/^\s*0*\d+\s*[.):-]?\s*/, "").replace(/\s+(Sub|Dub)(?:\s+|$)/gi, " "));
      const thumbnail = absoluteUrl(
        anchor.find("img").first().attr("data-src")
        || anchor.find("img").first().attr("data-lazy-src")
        || anchor.find("img").first().attr("src"),
        env.REANIME_BASE_URL
      );
      seen.add(number);
      episodes.push({
        id: id + "-" + number,
        number,
        ...(title && title !== rawText ? { title } : {}),
        url: parsed.toString(),
        ...(thumbnail ? { thumbnail } : {})
      });
    });

    return episodes.sort((a, b) => a.number - b.number);
  }

  async close(): Promise<void> { await this.transport.close(); }
}
