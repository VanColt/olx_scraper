import { Price, SearchResult } from '../schemas';

/** Photos included inline in search results; full set lives on the product. */
const SEARCH_PHOTO_COUNT = 2;
/** Search-result descriptions are truncated; full text lives on the product. */
const SEARCH_DESCRIPTION_CHARS = 300;

export function stripHtml(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function summarize(text: string | undefined): string {
  const clean = stripHtml(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > SEARCH_DESCRIPTION_CHARS
    ? clean.slice(0, SEARCH_DESCRIPTION_CHARS) + '…'
    : clean;
}

function mapCoordinates(map: any): { lat: number; lon: number } | null {
  return typeof map?.lat === 'number' && typeof map?.lon === 'number'
    ? { lat: map.lat, lon: map.lon }
    : null;
}

/**
 * Strip OLX image sizing/template suffixes to get full-resolution URLs.
 * Handles both fixed sizes (`;s=216x152`) and templates (`;s={width}x{height}`).
 */
export function cleanPhotoUrl(url: string): string {
  return url.replace(/;s=\{?[\w]+\}?x\{?[\w]+\}?/g, '').replace(/;q=\d+/g, '');
}

export function absoluteUrl(url: string | undefined): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://www.olx.pl${url}`;
}

const EMPTY_PRICE: Price = { value: null, currency: 'PLN', display: '', negotiable: false, previousValue: null };

/**
 * Pull price, condition and remaining display parameters out of the `params`
 * array used by both the offers API and the prerendered product state.
 * Note: the offers API has NO top-level `price` field — price (including
 * `negotiable`) only exists here.
 */
export function extractParams(params: any[] | undefined): {
  price: Price;
  condition: string | null;
  parameters: Record<string, string>;
} {
  let price: Price = { ...EMPTY_PRICE };
  let condition: string | null = null;
  const parameters: Record<string, string> = {};

  for (const p of params || []) {
    const label = typeof p.value === 'string'
      ? p.value
      : (p.value?.label ?? p.normalizedValue ?? String(p.value ?? ''));

    if (p.key === 'price' || p.type === 'price') {
      price = {
        value: typeof p.value?.value === 'number' ? p.value.value : null,
        currency: p.value?.currency || p.value?.currencyCode || 'PLN',
        display: label,
        negotiable: !!(p.value?.negotiable ?? p.value?.arranged),
        previousValue: typeof p.value?.previous_value === 'number' ? p.value.previous_value : null,
      };
      continue;
    }
    if (p.key === 'state') {
      condition = p.value?.key || label || null;
    }
    const name = p.name || p.key;
    if (name) parameters[name] = label;
  }

  return { price, condition, parameters };
}

function joinLocation(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(', ');
}

/** Map an ad from the offers JSON API (snake_case) to a SearchResult. */
export function mapApiAd(ad: any): SearchResult {
  const { price, condition } = extractParams(ad.params);

  const photos: string[] = [];
  for (const p of (ad.photos || []).slice(0, SEARCH_PHOTO_COUNT)) {
    const raw = p?.link || p;
    if (typeof raw === 'string') photos.push(cleanPhotoUrl(raw));
  }

  return {
    id: String(ad.id ?? ''),
    title: ad.title || '',
    description: summarize(ad.description),
    price,
    location: joinLocation(ad.location?.city?.name, ad.location?.region?.name),
    coordinates: mapCoordinates(ad.map),
    condition,
    isPromoted: !!(ad.promotion?.top_ad || ad.promotion?.highlighted),
    isBusiness: !!ad.business,
    categoryId: ad.category?.id ?? null,
    hasDelivery: !!ad.delivery?.rock?.active,
    photos,
    seller: {
      id: ad.user?.id != null ? String(ad.user.id) : null,
      name: ad.contact?.name || ad.user?.name || '',
      memberSince: ad.user?.created || '',
    },
    postedAt: ad.created_time || null,
    refreshedAt: ad.last_refresh_time || null,
    url: absoluteUrl(ad.url),
  };
}

/** Map an ad from the page's __PRERENDERED_STATE__ (camelCase) to a SearchResult. */
export function mapPrerenderedAd(ad: any): SearchResult {
  const regular = ad.price?.regularPrice;

  // Prerendered photos are plain URL strings with a size suffix.
  const photos: string[] = (ad.photos || [])
    .slice(0, SEARCH_PHOTO_COUNT)
    .filter((p: any) => typeof p === 'string')
    .map(cleanPhotoUrl);

  return {
    id: String(ad.id ?? ''),
    title: ad.title || '',
    description: summarize(ad.description),
    price: {
      value: typeof regular?.value === 'number' ? regular.value : null,
      currency: regular?.currencyCode || 'PLN',
      display: ad.price?.displayValue || regular?.displayValue || '',
      negotiable: !!regular?.negotiable,
      previousValue: typeof regular?.previousValue === 'number' ? regular.previousValue : null,
    },
    location: ad.location?.pathName || joinLocation(ad.location?.cityName, ad.location?.regionName),
    coordinates: mapCoordinates(ad.map),
    condition: ad.itemCondition || null,
    isPromoted: !!ad.isPromoted,
    isBusiness: !!ad.isBusiness,
    categoryId: ad.category?.id ?? null,
    hasDelivery: !!ad.delivery?.rock?.active,
    photos,
    seller: {
      id: ad.user?.id != null ? String(ad.user.id) : null,
      name: ad.contact?.name || ad.user?.name || '',
      memberSince: ad.user?.created || '',
    },
    postedAt: ad.createdTime || null,
    refreshedAt: ad.lastRefreshTime || null,
    url: absoluteUrl(ad.url),
  };
}
