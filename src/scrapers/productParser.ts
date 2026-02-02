import * as cheerio from 'cheerio';
import { ProductDetail } from '../types';

export function parseProductDetail(html: string, url: string): ProductDetail {
  // Try JSON state first (most reliable)
  const jsonData = extractPrerenderedState(html);
  if (jsonData) {
    return parseFromJson(jsonData, url);
  }
  // Fallback to HTML parsing
  return parseFromHtml(html, url);
}

function extractPrerenderedState(html: string): any | null {
  const marker = 'window.__PRERENDERED_STATE__= "';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  // Extract the JSON string between the quotes: starts after '= "', ends at '";\n' or '";'
  const start = idx + marker.length - 1; // include opening "
  const endPattern = '";\n';
  let end = html.indexOf(endPattern, start);
  if (end === -1) {
    end = html.indexOf('";', start);
  }
  if (end === -1) return null;

  const raw = html.substring(start, end + 1); // include closing "

  try {
    const inner = JSON.parse(raw);
    const data = typeof inner === 'string' ? JSON.parse(inner) : inner;
    return data?.ad?.ad || data?.ad || null;
  } catch {
    return null;
  }
}

/**
 * Strip OLX image sizing/template suffixes to get full-resolution URLs.
 * Handles both fixed sizes (`;s=216x152`) and templates (`;s={width}x{height}`).
 */
function cleanPhotoUrl(url: string): string {
  return url.replace(/;s=\{?[\w]+\}?x\{?[\w]+\}?/g, '').replace(/;q=\d+/g, '');
}

/**
 * Parse product from OLX internal JSON API (/api/v1/offers/{id}/).
 */
export function parseProductFromApi(ad: any): ProductDetail {
  const params: Record<string, string> = {};
  let priceFromParams = '';
  if (ad.params) {
    for (const p of ad.params) {
      const key = p.name || p.key;
      const val = typeof p.value === 'string'
        ? p.value
        : (p.value?.label || p.normalizedValue || String(p.value));
      if (key === 'price' || key === 'Cena') {
        priceFromParams = val;
      } else {
        params[key] = val;
      }
    }
  }

  const photos: string[] = [];
  if (ad.photos) {
    for (const p of ad.photos) {
      const raw = p.link || p;
      if (raw) photos.push(cleanPhotoUrl(raw));
    }
  }

  const locationParts: string[] = [];
  if (ad.location?.city?.name) locationParts.push(ad.location.city.name);
  if (ad.location?.region?.name) locationParts.push(ad.location.region.name);

  const price = ad.price?.displayValue
    || ad.price?.regularPrice?.displayValue
    || (ad.price?.regularPrice?.value
      ? `${ad.price.regularPrice.value} ${ad.price.regularPrice.currencyCode || 'zł'}`
      : '')
    || priceFromParams;

  return {
    id: String(ad.id || ''),
    title: ad.title || '',
    description: (ad.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
    price,
    negotiable: ad.price?.negotiable || false,
    parameters: params,
    photos,
    location: ad.location?.pathName || locationParts.join(', '),
    postedAt: ad.last_refresh_time || ad.created_time || ad.lastRefreshTime || ad.createdTime || '',
    seller: {
      name: ad.contact?.name || ad.user?.name || '',
      memberSince: ad.user?.created || '',
    },
    url: ad.url ? (ad.url.startsWith('http') ? ad.url : `https://www.olx.pl${ad.url}`) : '',
  };
}

function parseFromJson(ad: any, url: string): ProductDetail {
  const params: Record<string, string> = {};
  if (ad.params) {
    for (const p of ad.params) {
      const key = p.name || p.key;
      const val = typeof p.value === 'string' ? p.value : (p.value?.label || p.normalizedValue || String(p.value));
      params[key] = val;
    }
  }

  const photos: string[] = [];
  if (ad.photos) {
    for (const p of ad.photos) {
      photos.push(p.link || p);
    }
  }

  return {
    id: String(ad.id || ''),
    title: ad.title || '',
    description: (ad.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
    price: ad.price?.displayValue || (ad.price?.regularPrice?.value
      ? `${ad.price.regularPrice.value} ${ad.price.regularPrice.currencyCode || 'zł'}`
      : ''),
    negotiable: ad.contact?.negotiation || ad.price?.negotiation || false,
    parameters: params,
    photos,
    location: ad.location?.pathName || [ad.location?.cityName, ad.location?.regionName].filter(Boolean).join(', '),
    postedAt: ad.lastRefreshTime || ad.createdTime || '',
    seller: {
      name: ad.contact?.name || ad.user?.name || '',
      memberSince: ad.user?.created || '',
    },
    url,
  };
}

function parseFromHtml(html: string, url: string): ProductDetail {
  const $ = cheerio.load(html);
  // Remove all inline style tags to avoid CSS pollution in .text()
  $('style').remove();

  const title = $('[data-testid="offer_title"]').text().trim();
  const priceText = $('[data-testid="ad-price-container"]').text().trim();
  const description = $('[data-testid="ad_description"]').text().trim();

  const params: Record<string, string> = {};
  $('[data-testid="ad-parameters-container"] p').each((_, el) => {
    const text = $(el).text().trim();
    const [key, ...vals] = text.split(':');
    if (key && vals.length) {
      params[key.trim()] = vals.join(':').trim();
    }
  });

  const photos: string[] = [];
  $('[data-testid="swiper-image"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('srcset')?.split(',')[0]?.trim().split(' ')[0] || '';
    if (src) photos.push(src);
  });

  const postedAt = $('[data-testid="ad-posted-at"]').text().trim();
  const sellerName = $('[data-testid="user-profile-user-name"]').text().trim();
  const memberSince = $('[data-testid="member-since"]').text().trim();

  const idMatch = url.match(/ID([a-zA-Z0-9]+)\.html/);
  const id = idMatch ? idMatch[1] : '';

  return {
    id,
    title,
    description,
    price: priceText,
    negotiable: priceText.toLowerCase().includes('negocj') || html.includes('"negotiation":true'),
    parameters: params,
    photos,
    location: '',
    postedAt,
    seller: { name: sellerName, memberSince },
    url,
  };
}
