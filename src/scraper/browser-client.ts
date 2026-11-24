import { env } from "../config/env.js";
import type { Browser, Page } from "playwright";

export class BrowserClient {
  private browserPromise: Promise<Browser> | undefined;

  async render(url: string): Promise<string> {
    const { chromium } = await import("playwright");
    this.browserPromise ??= chromium.launch({ headless: env.BROWSER_HEADLESS });
    const browser = await this.browserPromise;
    const page: Page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: env.BROWSER_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: Math.min(env.BROWSER_TIMEOUT_MS, 8_000) }).catch(() => undefined);
      return await page.content();
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => undefined);
      await browser?.close();
      this.browserPromise = undefined;
    }
  }
}
