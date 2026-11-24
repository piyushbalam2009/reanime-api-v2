import { load } from "cheerio";
import { BrowserClient } from "./browser-client.js";
import { HttpClient } from "./http-client.js";

export class HybridTransport {
  constructor(
    private readonly http = new HttpClient(),
    private readonly browser = new BrowserClient()
  ) {}

  async html(url: string, options: { browser?: boolean } = {}) {
    if (options.browser) {
      return load(await this.browser.render(url));
    }
    try {
      return load(await this.http.getText(url));
    } catch (error) {
      // Browser fallback is deliberately limited to fetch/parse failures.
      // It does not attempt to defeat authentication, bot checks, or access restrictions.
      if (error instanceof Error && /HTTP 4\d\d/.test(error.message)) throw error;
      return load(await this.browser.render(url));
    }
  }

  async close(): Promise<void> { await this.browser.close(); }
}
