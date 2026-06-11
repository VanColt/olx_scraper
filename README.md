<p align="center">
  <img src="public/logo.png" alt="OLX Scraper API" width="100" style="filter: brightness(0) invert(1);">
</p>

<h1 align="center">OLX.pl Scraping API + MCP Server</h1>

<p align="center">
  <strong>A clean, agent-ready API layer on top of OLX.pl</strong><br>
  REST API for apps and scripts &nbsp;•&nbsp; MCP server for AI agents<br>
  Built for educational purposes and personal research only.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#endpoints">Endpoints</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#mcp-server">MCP Server</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#filters">Filters</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#messaging">Messaging</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#docker">Docker</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#disclaimer">Disclaimer</a>
</p>

---

> **This project is developed strictly for educational and research purposes.**
> It is not affiliated with, endorsed by, or associated with OLX Group in any way.
> Use at your own discretion and responsibility. See [Disclaimer](#disclaimer).

---

## Features

- **Structured, agent-ready output** — numeric prices with currency and negotiability, ISO 8601 dates, condition, promoted/business flags, coordinates
- **One-call classification** — search results carry description excerpts, photos and seller info inline, so agents shortlist without fetching each listing
- **JSON-API-first search** — uses OLX's offers API directly (fast, no headless browser); prerendered-state and HTML parsing as automatic fallbacks
- **Filters, sorting, paging** — price range, condition, delivery, category, city/radius/region, `sort=price_asc|price_desc|newest`, `offset`
- **Location resolution** — "Kraków" or "małopolskie" resolved to OLX ids automatically (diacritics handled)
- **Full category tree** — find any of ~3,100 categories (4 levels) by name, e.g. "gitary elektryczne" → id 4558
- **Deal signals** — `price.previousValue` exposes seller price drops
- **Seller intelligence** — list any seller's active listings by `seller.id`
- **Batch product detail** — check a shortlist of up to 20 listings in one call
- **MCP server** — plug the scraper into Claude, Cursor, or any MCP-capable agent; runs locally over stdio, nothing to host
- **Schema drift alarms** — all output is validated with Zod; if OLX changes their format you get loud logs instead of silent garbage
- **Resilient fetching** — request queue with rate limiting, retries with backoff, stale-while-revalidate caching, pooled Playwright fallback for challenges
- **Interactive docs** — Scalar-powered API reference at `/olx/v1/docs`, response schemas generated from the same Zod schemas the API validates with
- **Docker-ready** — single command deployment with healthcheck

## Quick Start

```bash
# Clone
git clone https://github.com/vancolt/olx_scraper.git
cd olx_scraper

# Install
npm install

# Install the Playwright fallback browser (required once)
npx playwright install chromium

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects straight to the interactive API docs.

## Endpoints

### Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/olx/v1/search/{query}` | Search listings with filters, sorting, paging |
| `GET` | `/olx/v1/product/{id}` | Full product details |
| `GET` | `/olx/v1/products?ids=1,2,3` | Batch product details (up to 20 ids) |
| `GET` | `/olx/v1/categories` | List top-level OLX categories |
| `GET` | `/olx/v1/categories/tree?q=gitary` | Find any of ~3100 categories (4 levels) by name or parent |
| `GET` | `/olx/v1/locations/{name}` | Resolve a city/region name to OLX ids + coordinates |
| `GET` | `/olx/v1/seller/{id}/listings` | All active listings from one seller |
| `GET` | `/health` | Liveness check |

### Partial (Product)

Lightweight endpoints when you only need a slice of the data:

| Method | Endpoint | Returns |
|--------|----------|---------|
| `GET` | `/olx/v1/product/{id}/photos` | Photo URLs (full resolution) |
| `GET` | `/olx/v1/product/{id}/price` | Structured price |
| `GET` | `/olx/v1/product/{id}/seller` | Seller id, name + member since |
| `GET` | `/olx/v1/product/{id}/description` | Description, condition + parameters |

### Response shape

Prices and dates are structured for machine consumption:

```json
{
  "id": "1078034151",
  "title": "MacBook Pro A2159",
  "description": "Używany MacBook Pro A2159 z uszkodzoną matrycą. Kupiłem na allegro jako…",
  "price": { "value": 149, "currency": "PLN", "display": "149 zł", "negotiable": false, "previousValue": 200 },
  "condition": "used",
  "isPromoted": false,
  "isBusiness": false,
  "categoryId": 1611,
  "hasDelivery": true,
  "photos": ["https://ireland.apollo.olxcdn.com/v1/files/.../image"],
  "seller": { "id": "12345678", "name": "Mi", "memberSince": "2022-08-20T11:06:13+02:00" },
  "coordinates": { "lat": 51.1079, "lon": 17.0385 },
  "postedAt": "2026-06-09T17:48:14+02:00",
  "refreshedAt": "2026-06-09T17:48:14+02:00",
  "url": "https://www.olx.pl/d/oferta/..."
}
```

Search results carry a ~300-char description excerpt and the first two photos
inline, so an agent can classify and shortlist candidates from a single search
call — and only fetch full details (all photos, parameters, full description)
for finalists via the batch endpoint.

Search responses include `totalCount` (capped at 1000 by OLX), `visibleTotalCount`
(the real total), `offset`, and `source` (`api` | `prerendered` | `html` — which
extraction path produced the results).

### Error semantics (for agents)

| Status | Meaning | Retry? |
|--------|---------|--------|
| `404` | Listing not found / removed | No |
| `400` | Invalid query parameters (Zod issues included) | Fix input |
| `503` | OLX blocked the request (`retryable: true`) | Yes, back off |
| `502` | OLX changed their format (`retryable: false`) | No — file an issue |

## MCP Server

The package ships an [MCP](https://modelcontextprotocol.io) server so agents can
use the scraper as native tools. It runs **locally over stdio** — your MCP client
spawns it as a subprocess; there is nothing to host or deploy.

```bash
# From a checkout
npm run build   # then point your client at: node dist/mcp/index.js

# Or once published to npm (the package's only bin is the MCP server)
npx -y olx-scraper
```

Config block for Claude Desktop (`claude_desktop_config.json`), Claude Code,
Cursor, or any MCP client:

```json
{
  "mcpServers": {
    "olx": {
      "command": "node",
      "args": ["/path/to/olx_scraper/dist/mcp/index.js"],
      "env": { "REQUEST_DELAY_MS": "2000" }
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `olx_search_listings` | Search with filters, sorting, paging; results include description excerpts + photos for one-call classification |
| `olx_get_product` | Full product detail by ad id |
| `olx_get_products` | Batch detail for a shortlist (up to 20 ids) |
| `olx_get_product_part` | Just photos / price / seller / description |
| `olx_get_seller_listings` | All active listings from one seller |
| `olx_resolve_location` | City/region name → OLX ids + coordinates |
| `olx_list_categories` | Top-level categories with slugs |
| `olx_find_category` | Search the full category tree (e.g. "gitary elektryczne" → id 4558) |
| `olx_list_threads` | *(only when messaging is configured)* List conversations |
| `olx_reply_thread` | *(only when messaging is configured)* Reply in a thread |

Notes for MCP usage: env vars come from the client config (dotenv is not loaded),
all logging goes to stderr, and failures are returned as `isError` results with
a hint on whether retrying makes sense.

## Filters

All filters are query parameters on the search endpoint:

| Param | Type | Default | Example |
|-------|------|---------|---------|
| `limit` | integer (max 200) | 40 | `?limit=100` |
| `offset` | integer (max 960) | 0 | `?offset=200` |
| `sort` | string | `relevance` | `?sort=price_asc`, `price_desc`, `newest` |
| `min_price` | integer | — | `?min_price=500` |
| `max_price` | integer | — | `?max_price=5000` |
| `has_delivery` | boolean | — | `?has_delivery=true` |
| `condition` | string | — | `?condition=new`, `used` or `damaged` |
| `category` | string | — | `?category=99` (id, incl. subcategories) or `?category=elektronika` (slug) |
| `city` | string | — | `?city=Kraków` (name, slug or id — resolved automatically) |
| `distance` | integer (km, max 100) | — | `?city=Kraków&distance=30` |
| `region` | string | — | `?region=małopolskie` (ignored when `city` is set) |

`price.previousValue` is set whenever the seller has lowered the asking price —
a useful deal signal (e.g. `1250 → 999 zł`).

### Examples

```bash
# Basic search
curl 'http://localhost:3000/olx/v1/search/macbook'

# Filtered search
curl 'http://localhost:3000/olx/v1/search/macbook?limit=50&min_price=5000&max_price=9000&condition=used'

# Location-scoped, sorted search
curl 'http://localhost:3000/olx/v1/search/rower?city=krakow&distance=30&sort=price_asc'

# Product details
curl 'http://localhost:3000/olx/v1/product/1022942049'

# The agent workflow: find the right category, search inside it, batch-check finalists
curl 'http://localhost:3000/olx/v1/categories/tree?q=gitary%20elektryczne'   # → id 4558
curl 'http://localhost:3000/olx/v1/search/fender?category=4558&city=krakow&distance=50&sort=price_asc'
curl 'http://localhost:3000/olx/v1/products?ids=1078034151,1078063271'

# Vet a seller
curl 'http://localhost:3000/olx/v1/seller/84422259/listings'
```

## Messaging

Messaging endpoints exist but are **dormant until configured** — they use the
**official OLX Partner API v2**, which requires an approved application on
[developer.olx.pl](https://developer.olx.pl):

1. Register an app on the OLX Developer Portal and wait for manual verification.
2. Complete the OAuth2 flow (`https://www.olx.pl/oauth/authorize`, scopes `v2 read write`).
3. Set `OLX_PARTNER_ACCESS_TOKEN` (and optionally `OLX_CLIENT_ID` /
   `OLX_CLIENT_SECRET` / `OLX_PARTNER_REFRESH_TOKEN` for auto-refresh).

Once configured, `/olx/v1/messaging/threads*` routes and the `olx_list_threads` /
`olx_reply_thread` MCP tools come alive.

> **Hard limitation:** the official API can only **reply to existing threads**.
> OLX does not expose any endpoint to initiate first contact on a listing, and
> automating the website session to do so violates their ToS — this project
> deliberately does not implement that.

## Docker

```bash
# Build and run
docker compose up -d

# Access on port 691
curl http://localhost:691/olx/v1/search/macbook
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Internal server port |
| `REQUEST_DELAY_MS` | `2000` | Min delay between OLX requests (ms) |
| `PLAYWRIGHT_ENABLED` | `true` | Enable headless browser fallback |
| `SEARCH_CACHE_TTL_S` | `180` | Search result cache TTL (seconds) |
| `PRODUCT_CACHE_TTL_S` | `1800` | Product detail cache TTL (seconds) |
| `CATEGORIES_CACHE_TTL_S` | `86400` | Categories cache TTL (seconds) |
| `OLX_PARTNER_ACCESS_TOKEN` | — | Enables messaging (see [Messaging](#messaging)) |

## Development

```bash
npm run dev        # REST API with tsx
npm run dev:mcp    # MCP server on stdio
npm test           # parser tests against saved fixtures (no live requests)
npm run typecheck  # tsc --noEmit
```

Tests run against fixtures captured from real OLX responses
(`test/fixtures/`), so they catch parser regressions without hammering the
live site. At runtime, Zod validation logs `[schema-drift]` warnings the
moment OLX changes their payload shapes.

## Tech Stack

- **Runtime** — Node.js + TypeScript (CommonJS, built with `tsc`, dev via `tsx`)
- **Server** — Express
- **Scraping** — OLX offers JSON API first; Axios + Cheerio and pooled Playwright as fallbacks
- **Agent integration** — `@modelcontextprotocol/sdk` (stdio transport)
- **Validation** — Zod schemas shared by REST, MCP, and drift detection
- **Resilience** — Bottleneck rate limiting, axios-retry, lru-cache with stale-while-revalidate
- **Docs** — OpenAPI 3.0 + Scalar, response schemas generated from Zod at startup
- **Tests** — Vitest with snapshot tests over recorded fixtures

## Project Structure

```
src/
  index.ts              # Express app, Scalar docs, health, shutdown
  routes/
    search.ts           # Search endpoint (thin wrapper)
    product.ts          # Product detail + partial endpoints
    products.ts         # Batch product detail
    categories.ts       # Top-level categories + full-tree search
    locations.ts        # City/region name resolution
    seller.ts           # Seller listings
    messaging.ts        # Partner API messaging (dormant until configured)
  services/
    olx.ts              # Orchestration: caching, filter resolution, drift alarms
  scrapers/
    fetcher.ts          # Rate-limited HTTP client + pooled Playwright fallback
    searchApi.ts        # OLX offers JSON API (primary search path)
    searchParser.ts     # Prerendered-state + HTML fallback parsing
    productParser.ts    # Product mapping from the offers API
    mappers.ts          # Shared ad → structured-result mappers
    resolver.ts         # Slug → ids via OLX friendly-links (cities, categories)
    categoryTree.ts     # Full category tree extraction + name search
  docs/
    spec.ts             # OpenAPI spec: components generated from Zod schemas
  mcp/
    index.ts            # MCP server (stdio), olx_* tools
  messaging/
    partnerClient.ts    # Official OLX Partner API v2 client
    types.ts            # Partner API types
  schemas/
    index.ts            # Zod schemas — single source of truth
  types/
    index.ts            # Re-exported inferred types
  utils/
    cache.ts            # LRU caches with stale-while-revalidate
    errors.ts           # Upstream error types + HTTP mapping
    userAgent.ts        # User-Agent rotation
test/
  fixtures/             # Recorded OLX responses (no live calls in tests)
  *.test.ts             # Parser + mapper tests
```

## Disclaimer

**This project is provided strictly for educational and research purposes.**

- This software is **not affiliated with, endorsed by, or associated with OLX Group or any of its subsidiaries**.
- The author(s) **do not encourage or condone** the use of this software for any purpose that violates OLX's Terms of Service or any applicable laws.
- **Any use of this software is entirely at the user's own risk and discretion.** The author(s) accept no responsibility for how this software is used.
- Web scraping may be subject to legal restrictions depending on your jurisdiction. It is **your responsibility** to ensure compliance with all applicable laws, regulations, and terms of service before using this software.
- This project is intended as a **learning resource** for understanding API design, web scraping techniques, and TypeScript/Node.js development patterns.
- The author(s) make **no warranties** regarding the accuracy, reliability, or availability of the data returned by this software.

**If you are the rightful owner of OLX.pl or represent OLX Group and have concerns about this project, please open an issue and it will be addressed promptly.**

---

<p align="center">
  <sub>Built for learning. Use responsibly.</sub>
</p>
