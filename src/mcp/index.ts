#!/usr/bin/env node
/**
 * OLX Scraper MCP server (stdio).
 *
 * Runs locally — the MCP client (Claude Desktop/Code, Cursor, a custom agent)
 * spawns this process and talks JSON-RPC over stdio; nothing is hosted.
 * stdout is reserved for the protocol: all logging must go to stderr, and
 * dotenv is intentionally not loaded (env comes from the client config).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  searchListings,
  getProduct,
  getProducts,
  getCategories,
  getSellerListings,
  resolveLocation,
  findCategories,
} from '../services/olx';
import {
  ProductDetailSchema,
  SearchQuery,
  SearchResponseSchema,
  CategorySchema,
} from '../schemas';
import { OlxPartnerClient } from '../messaging/partnerClient';

const server = new McpServer({
  name: 'olx-scraper',
  version: '2.0.0',
});

type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err: any) {
    const retryable = err?.retryable === true || err?.response?.status === 429;
    return fail(
      `${err?.message || 'Request failed'}${retryable ? ' (retryable — back off and try again)' : ''}`,
    );
  }
}

server.registerTool(
  'olx_search_listings',
  {
    title: 'Search OLX.pl listings',
    description:
      'Search OLX.pl (Polish classifieds) for listings matching a query. '
      + 'Each result already includes a ~300-char description excerpt, the first 2 photo URLs, '
      + 'seller info, coordinates, numeric price with currency and negotiable flag, ISO 8601 dates, '
      + 'condition, and delivery availability — so you can classify and shortlist candidates from '
      + 'this single call, then fetch full details only for finalists (olx_get_products). '
      + 'price.previousValue is set when the seller has lowered the price (deal signal). '
      + 'When ranking, skip isPromoted=true results: promoted ads are always pinned first '
      + 'regardless of sort order. Auto-paginates up to `limit` results (max 200); use `offset` '
      + 'to walk further into the (OLX-capped) 1000-result window. totalCount is capped at 1000; '
      + 'visibleTotalCount is the real total.',
    inputSchema: {
      query: z.string().min(1).describe('Search phrase, e.g. "fender jazzmaster" or "rtx 4080"'),
      limit: z.number().int().min(1).max(200).default(40).describe('Maximum results to return'),
      offset: z.number().int().min(0).max(960).default(0).describe('Skip this many results (for paging beyond limit)'),
      sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).default('relevance').describe('Sort order (promoted ads stay pinned first — filter isPromoted when ranking)'),
      min_price: z.number().nonnegative().optional().describe('Minimum price in PLN'),
      max_price: z.number().nonnegative().optional().describe('Maximum price in PLN'),
      has_delivery: z.boolean().optional().describe('Only listings offering OLX delivery'),
      condition: z.enum(['new', 'used', 'damaged']).optional().describe('Item condition filter'),
      category: z.string().optional().describe('Numeric category id (e.g. "99" = Elektronika, includes subcategories) or slug (e.g. "elektronika")'),
      city: z.string().optional().describe('City name, slug or numeric id (e.g. "Kraków") — resolved automatically'),
      distance: z.number().int().min(0).max(100).optional().describe('Search radius in km around the city (requires city)'),
      region: z.string().optional().describe('Region/voivodeship name, slug or id (e.g. "małopolskie"); ignored when city is set'),
    },
    outputSchema: SearchResponseSchema.shape,
  },
  async ({ query, ...filters }) =>
    run(async () => ok(await searchListings(query, filters as SearchQuery))),
);

server.registerTool(
  'olx_get_product',
  {
    title: 'Get OLX product details',
    description:
      'Fetch full details for one OLX.pl listing by its numeric ad id (the `id` field from '
      + 'olx_search_listings). Includes description, structured price, condition, parameters, '
      + 'full-resolution photo URLs, location, seller info and ISO dates.',
    inputSchema: {
      id: z.string().regex(/^\d+$/).describe('Numeric OLX ad id, e.g. "1078034151"'),
    },
    outputSchema: ProductDetailSchema.shape,
  },
  async ({ id }) =>
    run(async () => {
      const product = await getProduct(id);
      if (!product) return fail(`Product ${id} not found (it may have been removed)`);
      return ok(product);
    }),
);

server.registerTool(
  'olx_get_products',
  {
    title: 'Get multiple OLX products',
    description:
      'Fetch full details for up to 20 OLX.pl listings in one call — use this to check a '
      + 'shortlist of candidates from olx_search_listings instead of calling olx_get_product '
      + 'repeatedly. Upstream requests are rate-limited sequentially (~2s each on cache miss), '
      + 'so prefer shortlists of 3-10 ids. Returns found products plus notFound/failed ids.',
    inputSchema: {
      ids: z.array(z.string().regex(/^\d+$/)).min(1).max(20).describe('Numeric OLX ad ids from search results'),
    },
  },
  async ({ ids }) => run(async () => ok(await getProducts(ids) as unknown as Record<string, unknown>)),
);

server.registerTool(
  'olx_get_product_part',
  {
    title: 'Get part of an OLX product',
    description:
      'Fetch only one slice of an OLX.pl listing — photos, price, seller, or description — '
      + 'when the full detail payload is not needed.',
    inputSchema: {
      id: z.string().regex(/^\d+$/).describe('Numeric OLX ad id'),
      part: z.enum(['photos', 'price', 'seller', 'description']).describe('Which slice to return'),
    },
  },
  async ({ id, part }) =>
    run(async () => {
      const product = await getProduct(id);
      if (!product) return fail(`Product ${id} not found (it may have been removed)`);
      switch (part) {
        case 'photos': return ok({ id: product.id, photos: product.photos });
        case 'price': return ok({ id: product.id, price: product.price });
        case 'seller': return ok({ id: product.id, seller: product.seller });
        case 'description': return ok({
          id: product.id,
          description: product.description,
          condition: product.condition,
          parameters: product.parameters,
        });
      }
    }),
);

server.registerTool(
  'olx_get_seller_listings',
  {
    title: 'List a seller\'s other listings',
    description:
      'Fetch all active listings from one OLX.pl seller, by the numeric seller id found in '
      + 'search/product results (seller.id). Useful for judging a seller\'s track record, '
      + 'spotting dealers posing as private sellers, or finding bundle opportunities.',
    inputSchema: {
      seller_id: z.string().regex(/^\d+$/).describe('Numeric OLX user id from seller.id'),
      limit: z.number().int().min(1).max(200).default(40).describe('Maximum listings to return'),
    },
  },
  async ({ seller_id, limit }) =>
    run(async () => ok(await getSellerListings(seller_id, limit) as unknown as Record<string, unknown>)),
);

server.registerTool(
  'olx_resolve_location',
  {
    title: 'Resolve an OLX location',
    description:
      'Resolve a Polish city or region name (e.g. "Kraków", "Łódź", "małopolskie") to OLX\'s '
      + 'numeric location ids and coordinates. The search tool already resolves names itself — '
      + 'use this only to verify a location exists or to get its coordinates.',
    inputSchema: {
      name: z.string().min(1).describe('City or region name or slug'),
    },
  },
  async ({ name }) =>
    run(async () => {
      const location = await resolveLocation(name);
      if (!location || (location.cityId === null && location.regionId === null)) {
        return fail(`OLX doesn't know the location "${name}" — check the spelling (Polish names)`);
      }
      return ok(location);
    }),
);

server.registerTool(
  'olx_list_categories',
  {
    title: 'List OLX categories',
    description: 'List top-level OLX.pl categories with their slugs (usable as the `category` filter in olx_search_listings). For subcategories, use olx_find_category.',
    inputSchema: {},
    outputSchema: { categories: z.array(CategorySchema) },
  },
  async () => run(async () => ok({ categories: await getCategories() })),
);

server.registerTool(
  'olx_find_category',
  {
    title: 'Find an OLX category',
    description:
      'Search OLX.pl\'s full category tree (~3100 categories, 4 levels) by name fragment, or '
      + 'browse children of a node via parent_id. Returns numeric ids for the olx_search_listings '
      + '`category` filter — searching within the right subcategory (e.g. "Gitary elektryczne" '
      + 'instead of all of OLX) gives far more precise results. Matching is case- and '
      + 'diacritic-insensitive but expects Polish names (e.g. "gitary", "laptopy", "smartfony").',
    inputSchema: {
      query: z.string().optional().describe('Polish name fragment, e.g. "gitary" or "laptopy apple"'),
      parent_id: z.number().int().optional().describe('List children of this category id (0 = top level)'),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ query, parent_id, limit }) =>
    run(async () => {
      const categories = await findCategories({ query, parentId: parent_id, limit });
      if (categories.length === 0) {
        return fail(`No categories matched${query ? ` "${query}"` : ''} — try a shorter Polish name fragment`);
      }
      return ok({ categories });
    }),
);

// Messaging tools are only registered when Partner API credentials are
// configured (OLX_PARTNER_ACCESS_TOKEN). The official API is reply-only:
// it cannot initiate first contact on a listing.
if (process.env.OLX_PARTNER_ACCESS_TOKEN) {
  server.registerTool(
    'olx_list_threads',
    {
      title: 'List OLX message threads',
      description: 'List the authenticated user\'s OLX.pl conversation threads via the official Partner API.',
      inputSchema: {
        advert_id: z.number().int().optional().describe('Filter threads by ad id'),
      },
    },
    async ({ advert_id }) =>
      run(async () => {
        const client = OlxPartnerClient.fromEnv()!;
        return ok({ threads: await client.listThreads(advert_id ? { advert_id } : undefined) });
      }),
  );

  server.registerTool(
    'olx_reply_thread',
    {
      title: 'Reply in an OLX message thread',
      description:
        'Send a reply in an EXISTING OLX.pl conversation thread via the official Partner API. '
        + 'Cannot start new conversations — OLX does not expose that capability.',
      inputSchema: {
        thread_id: z.number().int().describe('Thread id from olx_list_threads'),
        text: z.string().min(1).describe('Message text to send'),
      },
    },
    async ({ thread_id, text }) =>
      run(async () => {
        const client = OlxPartnerClient.fromEnv()!;
        return ok({ sent: await client.sendMessage(thread_id, text) });
      }),
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('olx-scraper MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
