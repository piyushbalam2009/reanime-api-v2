import { env } from "../config/env.js";

const DEFAULT_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9"
};

export class HttpClient {
  async getText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { ...DEFAULT_HEADERS, referer: new URL(url).origin + "/", ...headers },
        redirect: "follow"
      });
      if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status} for ${new URL(url).pathname}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  async getJson<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const text = await this.getText(url, { accept: "application/json, */*", ...headers });
    try { return JSON.parse(text) as T; }
    catch { throw new Error(`Upstream returned invalid JSON for ${new URL(url).pathname}`); }
  }

  async getBytes(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { ...DEFAULT_HEADERS, accept: "*/*", referer: new URL(url).origin + "/", ...headers },
        redirect: "follow"
      });
      if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status} for ${new URL(url).pathname}`);
      return new Uint8Array(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }
}
