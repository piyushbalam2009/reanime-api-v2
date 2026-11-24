import { env } from "../config/env.js";

export class HttpClient {
  async getText(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "ReAnimeAPI/2.0 (+public website metadata client)",
          "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
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
}
