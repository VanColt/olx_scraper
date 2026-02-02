<p align="center">
  <img src="public/logo.png" alt="OLX Scraper API" width="100" style="filter: brightness(0) invert(1);">
</p>

<h1 align="center">OLX.pl Scraping API</h1>

<p align="center">
  <strong>A clean, RESTful API layer on top of OLX.pl</strong><br>
  Built for educational purposes and personal research only.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#endpoints">Endpoints</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#filters">Filters</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#docker">Docker</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#disclaimer">Disclaimer</a>
</p>

---

> **This project is developed strictly for educational and research purposes.**
> It is not affiliated with, endorsed by, or associated with OLX Group in any way.
> Use at your own discretion and responsibility. See [Disclaimer](#disclaimer).

---

## Features

- **Search with filters** — price range, condition, delivery, category
- **Auto-pagination** — request `limit=200` and the API collects results across pages automatically
- **Product detail** — full listing data via OLX internal API (photos, price, seller, parameters)
- **Partial endpoints** — fetch only photos, price, seller, or description for a listing
- **Interactive docs** — Scalar-powered API reference at `/olx/v1/docs`
- **Playwright fallback** — automatic headless browser fallback on captcha/403
- **Docker-ready** — single command deployment

## Quick Start

```bash
# Clone
git clone https://github.com/vancolt/olx-scraper.git
cd olx-scraper

# Install
npm install

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects straight to the interactive API docs.

## Endpoints

### Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/olx/v1/search/{query}` | Search listings with filters |
| `GET` | `/olx/v1/product/{id}` | Full product details |
| `GET` | `/olx/v1/categories` | List all OLX categories |

### Partial (Product)

Lightweight endpoints when you only need a slice of the data:

| Method | Endpoint | Returns |
|--------|----------|---------|
| `GET` | `/olx/v1/product/{id}/photos` | Photo URLs (full resolution) |
| `GET` | `/olx/v1/product/{id}/price` | Price + negotiability |
| `GET` | `/olx/v1/product/{id}/seller` | Seller name + member since |
| `GET` | `/olx/v1/product/{id}/description` | Description + parameters |

## Filters

All filters are query parameters on the search endpoint:

| Param | Type | Default | Example |
|-------|------|---------|---------|
| `limit` | integer | 40 | `?limit=100` |
| `min_price` | integer | — | `?min_price=500` |
| `max_price` | integer | — | `?max_price=5000` |
| `has_delivery` | boolean | — | `?has_delivery=true` |
| `condition` | string | — | `?condition=new` or `used` |
| `category` | string | — | `?category=elektronika` |

### Examples

```bash
# Basic search
curl 'http://localhost:3000/olx/v1/search/macbook'

# Filtered search
curl 'http://localhost:3000/olx/v1/search/macbook?limit=50&min_price=5000&max_price=9000&condition=used'

# Product details
curl 'http://localhost:3000/olx/v1/product/1022942049'

# Just the photos
curl 'http://localhost:3000/olx/v1/product/1022942049/photos'

# Categories
curl 'http://localhost:3000/olx/v1/categories'

# Pretty-print
curl -s 'http://localhost:3000/olx/v1/search/macbook' | jq .
```

## Docker

```bash
# Build and run
docker compose up -d

# Access on port 691
curl http://localhost:691/olx/v1/search/macbook
```

The container exposes port **691** and maps it to the internal application port.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Internal server port |
| `REQUEST_DELAY_MS` | `2000` | Min delay between OLX requests (ms) |
| `PLAYWRIGHT_ENABLED` | `true` | Enable headless browser fallback |

## Tech Stack

- **Runtime** — Node.js + TypeScript
- **Server** — Express
- **Scraping** — Axios + Cheerio, Playwright fallback
- **Docs** — OpenAPI 3.0 + Scalar

## Project Structure

```
src/
  index.ts              # Express app, Scalar docs, route mounting
  routes/
    search.ts           # Search with filters + auto-pagination
    product.ts          # Product detail + partial endpoints
    categories.ts       # Category listing
  scrapers/
    fetcher.ts          # HTTP client with rate limiting + Playwright fallback
    searchParser.ts     # Search result extraction (JSON-first, HTML fallback)
    productParser.ts    # Product detail parsing
  types/
    index.ts            # TypeScript interfaces
  utils/
    userAgent.ts        # User-Agent rotation
public/
  logo.png              # API documentation logo
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
