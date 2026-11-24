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
