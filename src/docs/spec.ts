import { readFileSync } from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { z } from 'zod';
import {
  CategoryNodeSchema,
  CategorySchema,
  LocationInfoSchema,
  PriceSchema,
  ProductDetailSchema,
  SearchResponseSchema,
  SearchResultSchema,
  SellerSchema,
} from '../schemas';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));

/**
 * Response schemas are generated from the same Zod schemas the API validates
 * with — the docs cannot drift from the implementation.
 */
function toSchema(schema: z.ZodType): object {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' });
}

// Canonical examples taken from real (verified) OLX responses.
const SEARCH_RESULT_EXAMPLE = {
  id: '1078034151',
  title: 'MacBook Pro A2159 uszkodzony',
  description: 'Używany MacBook Pro A2159 z uszkodzoną matrycą. Kupiłem na allegro jako…',
  price: { value: 149, currency: 'PLN', display: '149 zł', negotiable: false, previousValue: 200 },
  location: 'Wrocław, Dolnośląskie',
  coordinates: { lat: 51.11464, lon: 17.06436 },
  condition: 'used',
  isPromoted: false,
  isBusiness: false,
  categoryId: 1611,
  hasDelivery: true,
  photos: ['https://ireland.apollo.olxcdn.com:443/v1/files/o2j6blqf95n-PL/image'],
  seller: { id: '12345678', name: 'Mi', memberSince: '2022-08-20T11:06:13+02:00' },
  postedAt: '2026-06-09T17:48:14+02:00',
  refreshedAt: '2026-06-09T17:48:14+02:00',
  url: 'https://www.olx.pl/d/oferta/macbook-pro-a2159-uszkodzony-CID99-ID1aXjWB.html',
};

const EXAMPLES: Record<string, unknown> = {
  SearchResponse: {
    totalCount: 1000,
    visibleTotalCount: 8973,
    limit: 40,
    offset: 0,
    source: 'api',
    results: [SEARCH_RESULT_EXAMPLE],
  },
  SearchResult: SEARCH_RESULT_EXAMPLE,
  ProductDetail: {
    ...SEARCH_RESULT_EXAMPLE,
    description: 'Używany MacBook Pro A2159 z uszkodzoną matrycą. (full text…)',
    parameters: { Stan: 'Uszkodzone', 'Przekątna ekranu': '13-13,9"', Model: 'MacBook Pro' },
    validTo: '2026-07-05T19:08:01+02:00',
  },
  LocationInfo: {
    cityId: 8959,
    regionId: 4,
    city: 'Kraków',
    region: 'Małopolskie',
    lat: 50.07567,
    lon: 19.93084,
  },
  CategoryNode: {
    id: 4558,
    name: 'Gitary elektryczne',
    slug: 'gitary-elektryczne',
    path: 'muzyka-edukacja/instrumenty/gitary/gitary-elektryczne',
    parentId: 4552,
    level: 4,
    children: [],
  },
  Category: { name: 'Elektronika', slug: 'elektronika', url: 'https://www.olx.pl/elektronika/' },
};

function buildComponents(): Record<string, object> {
  const sources: Record<string, z.ZodType> = {
    Price: PriceSchema,
    Seller: SellerSchema,
    SearchResult: SearchResultSchema,
    SearchResponse: SearchResponseSchema,
    ProductDetail: ProductDetailSchema,
    Category: CategorySchema,
    CategoryNode: CategoryNodeSchema,
    LocationInfo: LocationInfoSchema,
  };

  const schemas: Record<string, object> = {};
  for (const [name, schema] of Object.entries(sources)) {
    const json: any = toSchema(schema);
    if (EXAMPLES[name]) json.example = EXAMPLES[name];
    schemas[name] = json;
  }

  schemas.Error = {
    type: 'object',
    properties: {
      error: { type: 'string' },
      retryable: {
        type: 'boolean',
        description: 'true → back off and retry; false → retrying will not help',
      },
      details: { type: 'string' },
    },
    required: ['error'],
    example: { error: 'OLX blocked the request while fetching search results', retryable: true },
  };

  schemas.BatchProductsResult = {
    type: 'object',
    properties: {
      products: { type: 'array', items: { $ref: '#/components/schemas/ProductDetail' } },
      notFound: { type: 'array', items: { type: 'string' }, description: 'Ids that no longer exist on OLX' },
      failed: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, error: { type: 'string' } },
        },
        description: 'Ids whose fetch failed (worth retrying)',
      },
    },
    example: { products: ['(ProductDetail…)'], notFound: ['9999999999'], failed: [] },
  };

  schemas.SellerListingsResult = {
    type: 'object',
    properties: {
      sellerId: { type: 'string' },
      totalCount: { type: 'number' },
      results: { type: 'array', items: { $ref: '#/components/schemas/SearchResult' } },
    },
  };

  return schemas;
}

const DESCRIPTION = `
<img src="/olx/v1/logo.png" width="120" style="filter: brightness(0) invert(1);" />

Unofficial, agent-ready REST API over OLX.pl — structured prices, ISO dates, and
inline descriptions/photos so listings can be classified from a single search call.
Built for educational and personal research purposes; also available as a local
[MCP server](#description/mcp-server) for AI agents.

## The agent workflow

1. \`GET /olx/v1/categories/tree?q=gitary elektryczne\` → category id **4558**
2. \`GET /olx/v1/search/fender?category=4558&city=krakow&distance=50&sort=price_asc\`
   — every result carries a ~300-char description, photos, seller and coordinates:
   shortlist directly from this response
3. \`GET /olx/v1/products?ids=…\` — full details for the finalists in one call
4. \`GET /olx/v1/seller/{id}/listings\` — vet the seller (dealer posing as private?)

**Deal signals:** \`price.previousValue\` is set when the seller lowered the price.
**Ranking hygiene:** \`isPromoted: true\` results are paid ads, always pinned first
regardless of \`sort\` — skip them when ranking by price or date.

## Error semantics

| Status | Meaning | Retry? |
|--------|---------|--------|
| \`400\` | Invalid parameters (details included) | Fix input |
| \`404\` | Listing/location not found | No |
| \`502\` | OLX changed their format (\`retryable: false\`) | No |
| \`503\` | OLX blocked the request (\`retryable: true\`) | Back off, retry |

## Rate limiting & caching

Upstream requests are serialized (~1 per \`REQUEST_DELAY_MS\`, default 2 s) to stay
polite to OLX. Responses are cached — search ~3 min, products ~30 min, categories
24 h — so repeated calls during an agent session are instant and free.

## MCP server

The same functionality ships as Model Context Protocol tools (\`olx_search_listings\`,
\`olx_find_category\`, \`olx_get_products\`, …) running locally over stdio — see the
README for the one-block client config.

> Not affiliated with OLX Group. Educational and research use only.
`;

export function buildSwaggerSpec(): object {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'OLX.pl Scraper API',
        version: pkg.version,
        description: DESCRIPTION,
        'x-logo': {
          url: '/olx/v1/logo.png',
          altText: 'OLX Scraper API',
        },
      },
      servers: [], // populated dynamically per request
      tags: [
        { name: 'Search', description: 'Search OLX listings with filters, sorting, location and auto-pagination' },
        { name: 'Product', description: 'Retrieve full product details by ID (single or batch)' },
        { name: 'Product — Partial', description: 'Retrieve specific parts of a product listing' },
        { name: 'Categories', description: 'Browse and search the full OLX category tree' },
        { name: 'Locations', description: 'Resolve city/region names to OLX location ids' },
        { name: 'Seller', description: 'Browse a seller\'s listings' },
        { name: 'Messaging', description: 'OLX Partner API messaging (requires approved API access; reply-only)' },
        { name: 'Meta', description: 'Service health' },
      ],
      components: { schemas: buildComponents() },
    },
    apis: ['./src/routes/*.ts', './src/index.ts'],
  }) as object;
}
