# ReAnime API v2

A standalone TypeScript/Node.js **HTTP-only** scraper project for the public ReAnime website. It exposes a REST API, reusable TypeScript SDK, CLI, interactive endpoint documentation, and a browser-based API playground.

## Architecture

- **HTTP-only scraper:** Fetch public pages using Node.js native Fetch API with request timeouts and parse HTML using Cheerio.
- **No browser automation:** Playwright, Chromium, browser rendering, and browser JavaScript execution are not used or installed.
- **REST API:** Express routes expose normalized JSON responses.
- **Documentation:** Visit /docs for endpoint reference and examples.
- **Playground:** Visit /playground to send requests and inspect JSON responses or copy cURL commands.
- **SDK:** Typed client for consuming this API from Node.js/TypeScript applications.
- **CLI:** Terminal commands for health, search, anime details, and episodes.
- **Safety:** The scraper does not bypass authentication, paywalls, CAPTCHAs, access controls, or other restrictions. It uses publicly accessible website content only.

## Requirements

- Node.js 20.11+
- npm

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

No browser binaries or browser installation steps are required.

## HTTP fetching and parsing

All scraper requests pass through src/scraper/http-client.ts, which uses the built-in Node.js Fetch API. HTML is parsed by Cheerio in src/scraper/transport.ts. If the upstream website requires client-side JavaScript to render a page, this HTTP-only scraper cannot render that page; it reports the upstream or parsing failure instead of switching to a browser.

Configure HTTP_TIMEOUT_MS to control the maximum duration of each upstream request.

## Web interfaces

- / — redirects to documentation
- /docs — endpoint reference, parameters, response formats, and cURL examples
- /playground — interactive request builder and JSON response viewer

## REST API

Base path: /api/v1

| Method | Endpoint | Description |
|---|---|---|
| GET | /health | API process health |
| GET | /api/v1/search?q={query} | Search anime |
| GET | /api/v1/anime/{id} | Anime details |
| GET | /api/v1/anime/{id}/episodes | Episode list |

Search query q is required and must contain 1–120 characters. Anime id must contain 1–180 characters. Successful responses use { "success": true, "data": ... }. Errors use { "success": false, "error": { "code": ..., "message": ... } }.

The current API does not expose streaming/server extraction. Website markup and selectors can change; validate live source behavior before relying on scraped data in production.

## CLI

```bash
npm run cli -- health
npm run cli -- search "frieren"
npm run cli -- anime <id>
npm run cli -- episodes <id>
```

## Build and test

```bash
npm run typecheck
npm test
npm run build
npm start
```

## License

MIT
