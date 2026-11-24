# ReAnime API v2

A standalone TypeScript/Node.js scraper project for the public ReAnime website. It exposes a REST API, a reusable TypeScript SDK, a CLI, interactive endpoint documentation, and a browser-based API playground.

## Architecture

- **HTTP-first scraper:** Fetch public pages with the built-in Node fetch API and parse HTML with Cheerio.
- **Browser fallback:** Playwright is loaded only when a page explicitly requires browser rendering. No browser is launched for ordinary HTTP requests.
- **REST API:** Express routes expose normalized JSON responses.
- **Documentation:** Visit `/docs` for endpoint reference and examples.
- **Playground:** Visit `/playground` to send requests and inspect JSON responses or copy cURL commands.
- **SDK:** Typed client for consuming this API from Node.js/TypeScript applications.
- **CLI:** Terminal commands for health, search, anime details, and episodes.
- **Safety:** The scraper does not bypass authentication, paywalls, CAPTCHAs, access controls, or other restrictions. It uses publicly accessible website content only.

## Requirements

- Node.js 20.11+
- npm

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

HTTP-only usage does not require installing a browser. Install Chromium for pages which need the browser fallback.

## Web interfaces

- `/` — redirects to documentation
- `/docs` — endpoint reference, parameters, response formats, and cURL examples
- `/playground` — interactive request builder and JSON response viewer

## REST API

Base path: `/api/v1`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | API process health |
| GET | `/api/v1/search?q={query}` | Search anime |
| GET | `/api/v1/anime/{id}` | Anime details |
| GET | `/api/v1/anime/{id}/episodes` | Episode list |

Search query `q` is required and must contain 1–120 characters. Anime `id` must contain 1–180 characters. Successful responses use `{ "success": true, "data": ... }`. Errors use `{ "success": false, "error": { "code": ..., "message": ... } }`.

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
