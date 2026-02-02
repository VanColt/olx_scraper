import * as cheerio from 'cheerio';
import { SearchResult, SearchResponse } from '../types';

export function parseSearchResults(html: string, page: number): SearchResponse {
  // Try JSON-based extraction first (has real image URLs, not lazy-load placeholders)
  const jsonResult = parseFromJson(html, page);
  if (jsonResult && jsonResult.results.length > 0) {
    return jsonResult;
  }

  // Fallback to HTML parsing
  return parseFromHtml(html, page);
}

export function extractListingData(html: string): any[] | null {
  const marker = 'window.__PRERENDERED_STATE__= "';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const start = idx + marker.length - 1;
  const endPattern = '";\n';
  let end = html.indexOf(endPattern, start);
  if (end === -1) end = html.indexOf('";', start);
  if (end === -1) return null;

  const raw = html.substring(start, end + 1);

  try {
    const inner = JSON.parse(raw);
    const data = typeof inner === 'string' ? JSON.parse(inner) : inner;
    return data?.listing?.listing?.ads || data?.listing?.ads || null;
  } catch {
    return null;
  }
}

function extractTotalCount(html: string): number {
  const marker = 'window.__PRERENDERED_STATE__= "';
  const idx = html.indexOf(marker);
  if (idx === -1) return 0;

  const start = idx + marker.length - 1;
  const endPattern = '";\n';
  let end = html.indexOf(endPattern, start);
  if (end === -1) end = html.indexOf('";', start);
  if (end === -1) return 0;

  const raw = html.substring(start, end + 1);

  try {
    const inner = JSON.parse(raw);
    const data = typeof inner === 'string' ? JSON.parse(inner) : inner;
    return data?.listing?.listing?.totalCount || data?.listing?.totalCount || 0;
  } catch {
    return 0;
  }
}

function parseFromJson(html: string, page: number): SearchResponse | null {
  const ads = extractListingData(html);
  if (!ads) return null;

  const totalCount = extractTotalCount(html);
  const results: SearchResult[] = [];

  for (const ad of ads) {
    if (ad.isHighlighted && !ad.id) continue; // skip promoted banners

    const locationParts: string[] = [];
    if (ad.location?.city?.name) locationParts.push(ad.location.city.name);
    if (ad.location?.region?.name) locationParts.push(ad.location.region.name);

    const hasDelivery = Array.isArray(ad.delivery)
      ? ad.delivery.some((d: any) => d?.active)
      : !!(ad.delivery?.active || ad.safedeal?.active);

    results.push({
      id: String(ad.id || ''),
      title: ad.title || '',
      price: ad.price?.displayValue || ad.price?.regularPrice?.displayValue || '',
      location: locationParts.join(', '),
      date: ad.lastRefreshTime || ad.createdTime || '',
      hasDelivery,
      url: ad.url ? (ad.url.startsWith('http') ? ad.url : `https://www.olx.pl${ad.url}`) : '',
    });
  }

  return { totalCount, page, results };
}

function parseFromHtml(html: string, page: number): SearchResponse {
  const $ = cheerio.load(html);
  $('style').remove();
  const results: SearchResult[] = [];

  const totalText = $('[data-testid="total-count"]').text();
  const totalMatch = totalText.match(/(\d[\d\s]*)/);
  const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/\s/g, ''), 10) : 0;

  $('[data-testid="l-card"]').each((_, el) => {
    const card = $(el);
    const id = card.attr('id') || '';
    const linkEl = card.find('a').first();
    const href = linkEl.attr('href') || '';
    const url = href.startsWith('http') ? href : `https://www.olx.pl${href}`;

    const title = card.find('[data-testid="ad-card-title"] h4, [data-testid="ad-card-title"] h6').first().text().trim();
    const priceEl = card.find('[data-testid="ad-price"]').first();
    const price = priceEl.contents().filter((_, node) => node.type === 'text').text().trim() || priceEl.text().trim();

    const locationDate = card.find('[data-testid="location-date"]').text().trim();
    const parts = locationDate.split(' - ');
    const location = parts[0]?.trim() || '';
    const date = parts.slice(1).join(' - ').trim();

    const hasDelivery = card.find('[data-testid="card-delivery-badge"], [data-testid="free-delivery-tag"]').length > 0;

    if (id || title) {
      results.push({ id, title, price, location, date, hasDelivery, url });
    }
  });

  return { totalCount, page, results };
}


