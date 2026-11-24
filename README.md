# ReAnime API v2

A standalone TypeScript/Node.js scraper project for the public ReAnime website. It exposes a REST API, a reusable TypeScript SDK, and a CLI.

## Architecture

- **HTTP-first scraper:** Fetch public pages with the built-in Node fetch API and parse HTML with Cheerio.
- **Browser fallback:** Playwright is loaded only when a page explicitly requires browser rendering. No browser is launched for ordinary HTTP requests.
- **REST API:** Express routes expose normalized JSON responses.
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

## API

- `GET /health`
- `GET /api/v1/search?q=<query>`
- `GET /api/v1/anime/:id`
- `GET /api/v1/anime/:id/episodes`

Responses use a consistent envelope: `{ "success": true, "data": ... }`. Errors use `{ "success": false, "error": { "code": ..., "message": ... } }`.

The first implementation intentionally keeps selectors and discovered website routes centralized. Website markup and endpoints can change; validate live site behavior before relying on selectors in production.

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
