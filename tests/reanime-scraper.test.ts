import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { ReAnimeScraper } from "../src/scraper/reanime.scraper.js";
import type { HttpTransport } from "../src/scraper/transport.js";

describe("ReAnimeScraper search", () => {
  it("uses the current /search?q= route and returns anime cards only", async () => {
    const html = load(`
      <nav>
        <a href="/home">Watch now</a>
        <a href="/schedule">View Schedule</a>
        <a href="/it/">it</a>
      </nav>
      <main>
        <article class="anime-card">
          <a href="/anime/frieren-beyond-journeys-end-abc123">
            <img src="/images/frieren.jpg" alt="Frieren: Beyond Journey's End">
            <h3>Frieren: Beyond Journey's End</h3>
          </a>
        </article>
        <article class="anime-card">
          <a href="/anime/solo-leveling-def456">
            <img src="/images/solo-leveling.jpg" alt="Solo Leveling">
            <h3>Solo Leveling</h3>
          </a>
        </article>
      </main>
    `);

    const htmlRequest = vi.fn().mockResolvedValue(html);
    const transport = { html: htmlRequest, close: vi.fn() } as unknown as HttpTransport;
    const scraper = new ReAnimeScraper(transport);

    const results = await scraper.search("frieren");

    expect(htmlRequest).toHaveBeenCalledWith("https://reanime.cz/search?q=frieren");
    expect(results).toHaveLength(2);
    expect(results.map((item) => item.title)).toEqual([
      "Frieren: Beyond Journey's End",
      "Solo Leveling"
    ]);
    expect(results.map((item) => item.id)).toEqual([
      "frieren-beyond-journeys-end-abc123",
      "solo-leveling-def456"
    ]);
    expect(results.every((item) => item.url.includes("/anime/"))).toBe(true);
  });

  it("returns an empty list rather than navigation links when no anime cards exist", async () => {
    const html = load(`
      <nav>
        <a href="/home">Watch now</a>
        <a href="/schedule">View Schedule</a>
        <a href="/it/">it</a>
      </nav>
    `);
    const transport = { html: vi.fn().mockResolvedValue(html), close: vi.fn() } as unknown as HttpTransport;
    const scraper = new ReAnimeScraper(transport);

    await expect(scraper.search("not-a-real-anime")).resolves.toEqual([]);
  });
});


describe("ReAnimeScraper live page layouts", () => {
  it("extracts real anime metadata from the anime detail page layout", async () => {
    const html = load(`
      <main>
        <img src="https://image.example/attack.jpg" alt="Attack on Titan">
        <h1>Attack on Titan</h1>
        <h2>Shingeki no Kyojin</h2>
        <p class="synopsis">Humanity fights the titans.</p>
        <p>Episodes 25</p><p>Status Finished</p>
        <p>Start Date: 2013-04-07</p><p>Premiered: SPRING 2013</p>
        <p>Score: 8.5</p><p>Format: TV</p>
        <a href="/genre/action">Action</a><a href="/genre/drama">Drama</a>
      </main>
    `);
    const transport = { html: vi.fn().mockResolvedValue(html), close: vi.fn() } as unknown as HttpTransport;
    const scraper = new ReAnimeScraper(transport);
    const result = await scraper.details("attack-on-titan-p9y2p9");
    expect(transport.html).toHaveBeenCalledWith("https://reanime.cz/anime/attack-on-titan-p9y2p9");
    expect(result.title).toBe("Attack on Titan");
    expect(result.alternativeTitles).toEqual(["Shingeki no Kyojin"]);
    expect(result.episodes).toBe(25);
    expect(result.status).toContain("Finished");
    expect(result.genres).toEqual(["Action", "Drama"]);
    expect(result.rating).toBe("8.5");
    expect(result.releaseYear).toBe(2013);
  });

  it("loads the watch page and reads episode links from the ep query parameter", async () => {
    const html = load(`
      <main>
        <a href="/watch/attack-on-titan-p9y2p9?ep=1">01. To You, in 2000 Years: The Fall of Shiganshina (1) Sub Dub APR 6, 2013</a>
        <a href="/watch/attack-on-titan-p9y2p9?ep=2">02. That Day: The Fall of Shiganshina (2) Sub Dub APR 6, 2013</a>
        <a href="/anime/attack-on-titan-season-2">Season 2</a>
      </main>
    `);
    const transport = { html: vi.fn().mockResolvedValue(html), close: vi.fn() } as unknown as HttpTransport;
    const scraper = new ReAnimeScraper(transport);
    const result = await scraper.episodes("attack-on-titan-p9y2p9");
    expect(transport.html).toHaveBeenCalledWith("https://reanime.cz/watch/attack-on-titan-p9y2p9");
    expect(result).toHaveLength(2);
    expect(result.map((episode) => episode.number)).toEqual([1, 2]);
    expect(result[0]?.title).toContain("To You, in 2000 Years");
    expect(result[1]?.url).toContain("?ep=2");
  });
});
