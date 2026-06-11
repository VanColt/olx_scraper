import { fetchPage } from './fetcher';
import { mapApiAd } from './mappers';
import { SearchQuery, SearchResult } from '../schemas';
import { UpstreamParseError } from '../utils/errors';

const API_BASE = 'https://www.olx.pl/api/v1/offers/';
const PAGE_SIZE = 40;
// OLX caps total_elements at 1000; never paginate past it.
const MAX_OFFSET = 1000;

export interface ApiSearchPage {
  results: SearchResult[];
  totalCount: number;
  visibleTotalCount: number | null;
  nextOffset: number | null;
}

/** Verified mapping to the offers API's sort_by values (promoted ads stay pinned first regardless). */
const SORT_BY: Record<string, string | undefined> = {
  relevance: undefined,
  price_asc: 'filter_float_price:asc',
  price_desc: 'filter_float_price:desc',
  newest: 'created_at:desc',
};

/** Numeric ids resolved by the service from name/slug filters. */
export interface ResolvedFilters {
  categoryId?: number;
  cityId?: number;
  regionId?: number;
}

function buildUrl(
  query: string,
  filters: SearchQuery,
  resolved: ResolvedFilters,
  offset: number,
  pageSize: number,
): string {
  const params = new URLSearchParams();
  params.set('query', query);
  params.set('limit', String(pageSize));
  if (offset > 0) params.set('offset', String(offset));
  const sortBy = SORT_BY[filters.sort];
  if (sortBy) params.set('sort_by', sortBy);
  if (filters.min_price !== undefined) params.set('filter_float_price:from', String(filters.min_price));
  if (filters.max_price !== undefined) params.set('filter_float_price:to', String(filters.max_price));
  if (filters.condition) params.set('filter_enum_state[0]', filters.condition);
  if (filters.has_delivery) params.set('courier', '1');
  if (resolved.categoryId !== undefined) params.set('category_id', String(resolved.categoryId));
  if (resolved.cityId !== undefined) {
    params.set('city_id', String(resolved.cityId));
    if (filters.distance !== undefined) params.set('distance', String(filters.distance));
  } else if (resolved.regionId !== undefined) {
    params.set('region_id', String(resolved.regionId));
  }
  return API_BASE + '?' + params.toString();
}

export async function searchPageViaApi(
  query: string,
  filters: SearchQuery,
  resolved: ResolvedFilters,
  offset: number,
  remaining: number,
): Promise<ApiSearchPage> {
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, remaining));
  return requestPage(buildUrl(query, filters, resolved, offset, pageSize), offset);
}

/** One page of a seller's listings (the offers API accepts user_id without a query). */
export async function sellerPageViaApi(userId: string, offset: number, remaining: number): Promise<ApiSearchPage> {
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, remaining));
  const params = new URLSearchParams({ user_id: userId, limit: String(pageSize) });
  if (offset > 0) params.set('offset', String(offset));
  return requestPage(API_BASE + '?' + params.toString(), offset);
}

async function requestPage(url: string, offset: number): Promise<ApiSearchPage> {
  const body = await fetchPage(url, true);

  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new UpstreamParseError('Offers API returned non-JSON response');
  }
  if (!Array.isArray(data?.data)) {
    throw new UpstreamParseError('Offers API response is missing the data array');
  }

  const results = data.data.map(mapApiAd);
  const totalCount = data.metadata?.total_elements ?? 0;
  const visibleTotalCount = data.metadata?.visible_total_count ?? null;
  const consumed = offset + results.length;
  const hasNext = !!data.links?.next && results.length > 0 && consumed < Math.min(totalCount, MAX_OFFSET);

  return {
    results,
    totalCount,
    visibleTotalCount,
    nextOffset: hasNext ? consumed : null,
  };
}
