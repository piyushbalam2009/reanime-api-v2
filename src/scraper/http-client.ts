import { env } from "../config/env.js";

export class HttpClient {
  async getText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ReAnimeAPI/2.0; +https://github.com/piyushbalam2009/reanime-api-v2)",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "referer": new URL(url).origin + "/"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(`Upstream returned HTTP ${response.status} for ${new URL(url).pathname}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async getJson<T = unknown>(url: string): Promise<T> {
    const text = await this.getText(url);
    try { return JSON.parse(text) as T; }
    catch { throw new Error(`Upstream returned invalid JSON for ${new URL(url).pathname}`); }
  }
}
