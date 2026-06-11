import { fetchPage } from './fetcher';
import { LocationInfo } from '../schemas';
import { UpstreamParseError } from '../utils/errors';

/**
 * OLX resolves friendly URL slugs (cities, regions, categories, combinations
 * like "elektronika,krakow") to search parameters via this endpoint. We use
 * it to turn human names into the numeric ids the offers API filters by.
 */
const FRIENDLY_LINKS = 'https://www.olx.pl/api/v1/friendly-links/query-params/';

export interface ResolvedSlug {
  categoryId: number | null;
  location: LocationInfo;
}

/** "Łódź" → "lodz": lowercase, strip Polish diacritics, spaces to dashes. */
export function toSlug(name: string): string {
  const map: Record<string, string> = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  };
  return name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => map[c] || c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Resolve a slug (city, region, or category name) — null when OLX doesn't know it. */
export async function resolveSlug(slug: string): Promise<ResolvedSlug | null> {
  let body: string;
  try {
    body = await fetchPage(FRIENDLY_LINKS + encodeURIComponent(slug) + '/', true);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }

  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new UpstreamParseError('friendly-links returned non-JSON response');
  }
  if (data?.error || !data?.data) return null;

  const names = data.metadata?.names?.location || {};
  return {
    categoryId: data.data.category_id ?? null,
    location: {
      cityId: data.data.city_id ?? null,
      regionId: data.data.region_id ?? null,
      city: names.city?.name ?? null,
      region: names.region?.name ?? null,
      lat: names.city?.lat ?? null,
      lon: names.city?.lon ?? null,
    },
  };
}
