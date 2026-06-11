import * as cheerio from 'cheerio';
import { fetchPage } from '../scrapers/fetcher';
import { searchPageViaApi, sellerPageViaApi, ResolvedFilters } from '../scrapers/searchApi';
import { parseSearchResults } from '../scrapers/searchParser';
import { parseProductFromApi } from '../scrapers/productParser';
import { resolveSlug, toSlug } from '../scrapers/resolver';
import { parseCategoryTree, searchCategoryTree } from '../scrapers/categoryTree';
import { searchCache, productCache, categoriesCache, locationsCache } from '../utils/cache';
import { UnknownFilterError, UpstreamParseError } from '../utils/errors';
import {
  Category,
  CategoryNode,
  LocationInfo,
  ProductDetail,
  ProductDetailSchema,
  SearchQuery,
  SearchResponse,
  SearchResponseSchema,
  SearchResult,
} from '../schemas';

/**
 * Validate outgoing data against our schema so OLX-side drift is logged
 * loudly instead of silently shipping garbage. Data is still returned —
 * partial data beats no data for research use.
 */
function warnOnDrift(label: string, schema: { safeParse(v: unknown): { success: boolean; error?: any } }, value: unknown): void {
  const check = schema.safeParse(value);
  if (!check.success) {
    console.error(`[schema-drift] ${label} no longer matches expected shape:`, check.error?.issues?.slice(0, 3));
  }
}

const MAX_PAGES = 25;

/** Resolve a city/region name, slug or id to OLX location ids (cached). */
export async function resolveLocation(name: string): Promise<LocationInfo | null> {
  const slug = /^\d+$/.test(name) ? name : toSlug(name);
  const result = await locationsCache.getOrFetch(`loc:${slug}`, async () => {
    const resolved = await resolveSlug(slug);
    return { value: resolved?.location ?? null };
  });
  return (result as { value: LocationInfo | null }).value;
}

/** Resolve a category slug to its numeric id (cached). */
async function resolveCategoryId(slug: string): Promise<number | null> {
  const result = await locationsCache.getOrFetch(`cat:${toSlug(slug)}`, async () => {
    const resolved = await resolveSlug(toSlug(slug));
    return { value: resolved?.categoryId ?? null };
  });
  return (result as { value: number | null }).value;
}

/** Turn name/slug filters into the numeric ids the offers API expects. */
async function resolveFilters(filters: SearchQuery): Promise<ResolvedFilters> {
  const resolved: ResolvedFilters = {};

  if (filters.category) {
    if (/^\d+$/.test(filters.category)) {
      resolved.categoryId = parseInt(filters.category, 10);
    } else {
      const id = await resolveCategoryId(filters.category);
      if (id === null) throw new UnknownFilterError(`Unknown category: ${filters.category}`);
      resolved.categoryId = id;
    }
  }

  if (filters.city) {
    if (/^\d+$/.test(filters.city)) {
      resolved.cityId = parseInt(filters.city, 10);
    } else {
      const loc = await resolveLocation(filters.city);
      if (!loc?.cityId) throw new UnknownFilterError(`Unknown city: ${filters.city}`);
      resolved.cityId = loc.cityId;
    }
  } else if (filters.region) {
    if (/^\d+$/.test(filters.region)) {
      resolved.regionId = parseInt(filters.region, 10);
    } else {
      const loc = await resolveLocation(filters.region);
      if (!loc?.regionId) throw new UnknownFilterError(`Unknown region: ${filters.region}`);
      resolved.regionId = loc.regionId;
    }
  }

  return resolved;
}

export async function searchListings(query: string, filters: SearchQuery): Promise<SearchResponse> {
  const cacheKey = JSON.stringify({ query, ...filters });
  const result = await searchCache.getOrFetch(cacheKey, async () => {
    const resolved = await resolveFilters(filters);
    let response: SearchResponse;
    try {
      response = await searchViaApi(query, filters, resolved);
    } catch (err) {
      if (err instanceof UpstreamParseError) {
        console.error('Offers API failed, falling back to HTML search:', err.message);
        if (filters.city || filters.region) {
          console.error('Note: city/region/distance filters are not applied on the HTML fallback path');
        }
        response = await searchViaHtml(query, filters);
      } else {
        throw err;
      }
    }
    warnOnDrift('search response', SearchResponseSchema, response);
    return response;
  });
  return result as SearchResponse;
}

async function searchViaApi(query: string, filters: SearchQuery, resolved: ResolvedFilters): Promise<SearchResponse> {
  const collected: SearchResult[] = [];
  let totalCount = 0;
  let visibleTotalCount: number | null = null;
  let offset = filters.offset;

  for (let page = 0; page < MAX_PAGES && collected.length < filters.limit; page++) {
    const result = await searchPageViaApi(query, filters, resolved, offset, filters.limit - collected.length);
    if (page === 0) {
      totalCount = result.totalCount;
      visibleTotalCount = result.visibleTotalCount;
    }
    collected.push(...result.results);
    if (result.nextOffset === null) break;
    offset = result.nextOffset;
  }

  return {
    totalCount,
    visibleTotalCount,
    limit: filters.limit,
    offset: filters.offset,
    source: 'api',
    results: collected.slice(0, filters.limit),
  };
}

async function searchViaHtml(query: string, filters: SearchQuery): Promise<SearchResponse> {
  const slug = query.trim().replace(/\s+/g, '-');
  const basePath = filters.category && !/^\d+$/.test(filters.category)
    ? `https://www.olx.pl/${filters.category}/q-${slug}/`
    : `https://www.olx.pl/oferty/q-${slug}/`;

  const params: string[] = [];
  if (filters.min_price !== undefined) params.push(`search[filter_float_price:from]=${filters.min_price}`);
  if (filters.max_price !== undefined) params.push(`search[filter_float_price:to]=${filters.max_price}`);
  if (filters.condition) params.push(`search[filter_enum_state][0]=${filters.condition}`);
  if (filters.has_delivery) params.push('courier=1');
  const order = { relevance: '', price_asc: 'filter_float_price:asc', price_desc: 'filter_float_price:desc', newest: 'created_at:desc' }[filters.sort];
  if (order) params.push(`search[order]=${encodeURIComponent(order)}`);

  // HTML pages don't take an offset; approximate with page math (page size
  // varies slightly, so offsets on this fallback path are best-effort).
  const HTML_PAGE_SIZE = 40;
  const startPage = Math.floor(filters.offset / HTML_PAGE_SIZE) + 1;
  let skip = filters.offset - (startPage - 1) * HTML_PAGE_SIZE;

  const collected: SearchResult[] = [];
  let totalCount = 0;
  let source: SearchResponse['source'] = 'prerendered';
  let firstPageFirstId: string | undefined;

  for (let page = startPage; page <= MAX_PAGES && collected.length < filters.limit; page++) {
    const qs = [...params, ...(page > 1 ? [`page=${page}`] : [])];
    const url = basePath + (qs.length ? '?' + qs.join('&') : '');

    const parsed = parseSearchResults(await fetchPage(url));
    if (page === startPage) {
      totalCount = parsed.totalCount;
      source = parsed.source;
      firstPageFirstId = parsed.results[0]?.id;
    } else if (parsed.results[0]?.id === firstPageFirstId) {
      // OLX redirects out-of-range pages back to page 1; stop on repeats.
      break;
    }
    if (parsed.results.length === 0) break;

    collected.push(...parsed.results.slice(skip));
    skip = 0;
    if (parsed.totalPages !== null && page >= parsed.totalPages) break;
  }

  return {
    totalCount,
    visibleTotalCount: null,
    limit: filters.limit,
    offset: filters.offset,
    source,
    results: collected.slice(0, filters.limit),
  };
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const result = await productCache.getOrFetch(id, async () => {
    const json = await fetchPage(`https://www.olx.pl/api/v1/offers/${id}/`, true);

    let data: any;
    try {
      data = JSON.parse(json);
    } catch {
      throw new UpstreamParseError(`Offers API returned non-JSON response for product ${id}`);
    }

    if (!data?.data?.id) return { notFound: true };
    const product = parseProductFromApi(data.data);
    warnOnDrift(`product ${id}`, ProductDetailSchema, product);
    return product;
  });

  return (result as any).notFound ? null : (result as ProductDetail);
}

export interface SellerListingsResult {
  sellerId: string;
  totalCount: number;
  results: SearchResult[];
}

/** All active listings from one seller (offers API user_id filter). */
export async function getSellerListings(sellerId: string, limit: number): Promise<SellerListingsResult> {
  const result = await searchCache.getOrFetch(`seller:${sellerId}:${limit}`, async () => {
    const collected: SearchResult[] = [];
    let totalCount = 0;
    let offset = 0;

    for (let page = 0; page < MAX_PAGES && collected.length < limit; page++) {
      const pageResult = await sellerPageViaApi(sellerId, offset, limit - collected.length);
      if (page === 0) totalCount = pageResult.totalCount;
      collected.push(...pageResult.results);
      if (pageResult.nextOffset === null) break;
      offset = pageResult.nextOffset;
    }

    return { sellerId, totalCount, results: collected.slice(0, limit) };
  });
  return result as SellerListingsResult;
}

export interface BatchProductsResult {
  products: ProductDetail[];
  notFound: string[];
  failed: { id: string; error: string }[];
}

/**
 * Fetch several products in one call (for checking an agent's shortlist).
 * Requests still go through the shared rate limiter sequentially; cached
 * products return instantly.
 */
export async function getProducts(ids: string[]): Promise<BatchProductsResult> {
  const products: ProductDetail[] = [];
  const notFound: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const settled = await Promise.allSettled(ids.map((id) => getProduct(id)));
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      if (outcome.value) products.push(outcome.value);
      else notFound.push(ids[i]);
    } else {
      const err: any = outcome.reason;
      if (err?.response?.status === 404) notFound.push(ids[i]);
      else failed.push({ id: ids[i], error: err?.message || 'Request failed' });
    }
  });

  return { products, notFound, failed };
}

/**
 * The complete OLX category tree (~3100 nodes, 4 levels), extracted from the
 * homepage's prerendered state and cached for a day.
 */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const result = await categoriesCache.getOrFetch('category-tree', async () => {
    const html = await fetchPage('https://www.olx.pl/');
    const tree = parseCategoryTree(html);
    if (!tree) {
      throw new UpstreamParseError('Category tree not found in the OLX homepage state');
    }
    return { tree };
  });
  return (result as { tree: CategoryNode[] }).tree;
}

/** Find categories by name fragment and/or list the children of a node. */
export async function findCategories(opts: {
  query?: string;
  parentId?: number;
  limit?: number;
}): Promise<CategoryNode[]> {
  const tree = await getCategoryTree();
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));

  if (opts.query) {
    const matches = searchCategoryTree(tree, opts.query, limit);
    return opts.parentId !== undefined
      ? matches.filter((c) => c.parentId === opts.parentId)
      : matches;
  }
  if (opts.parentId !== undefined) {
    return tree.filter((c) => c.parentId === opts.parentId).slice(0, limit);
  }
  // No filters: return the top level.
  return tree.filter((c) => c.level === 1).slice(0, limit);
}

export async function getCategories(): Promise<Category[]> {
  try {
    const tree = await getCategoryTree();
    return tree
      .filter((c) => c.level === 1)
      .map((c) => ({
        name: c.name,
        slug: c.path,
        url: `https://www.olx.pl/${c.path}/`,
      }));
  } catch (err) {
    console.error('Category tree unavailable, falling back to homepage scrape:', (err as Error).message);
    return getCategoriesFromHomepageDom();
  }
}

async function getCategoriesFromHomepageDom(): Promise<Category[]> {
  const result = await categoriesCache.getOrFetch('categories-dom', async () => {
    const html = await fetchPage('https://www.olx.pl/');
    const $ = cheerio.load(html);
    const categories: Category[] = [];

    $('[data-testid^="cat-"]').each((_, el) => {
      const a = $(el);
      if (a.is('a')) {
        const href = a.attr('href') || '';
        const name = a.find('p').text().trim() || a.text().trim();
        const slug = href.replace(/^\//, '').replace(/\/$/, '');
        if (name && slug) {
          categories.push({
            name,
            slug,
            url: href.startsWith('http') ? href : `https://www.olx.pl${href}`,
          });
        }
      }
    });

    if (categories.length === 0) {
      throw new UpstreamParseError('No categories found on the OLX homepage');
    }
    return { categories };
  });

  return (result as { categories: Category[] }).categories;
}
