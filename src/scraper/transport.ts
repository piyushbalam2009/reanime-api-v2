import { load } from "cheerio";
import { HttpClient } from "./http-client.js";

/** Fetch HTML over HTTP and parse it with Cheerio. No browser fallback. */
export class HttpTransport {
  constructor(private readonly http = new HttpClient()) {}

  async html(url: string) {
    return load(await this.http.getText(url));
  }

  async json<T = unknown>(url: string): Promise<T> {
    return this.http.getJson<T>(url);
  }

  async close(): Promise<void> {
    // Lifecycle hook retained for graceful service shutdown.
  }
}
