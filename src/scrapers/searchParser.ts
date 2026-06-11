import * as cheerio from 'cheerio';
import { SearchResult } from '../schemas';
import { mapPrerenderedAd } from './mappers';

export interface ParsedSearchPage {
  totalCount: number;
  totalPages: number | null;
  source: 'prerendered' | 'html';
  results: SearchResult[];
}

/**
 * Fallback search parsing for HTML pages (used when the offers JSON API is
 * unavailable or for slug-category searches): prerendered state first, then
 * DOM scraping as a last resort.
 */
export function parseSearchResults(html: string): ParsedSearchPage {
  const jsonResult = parseFromPrerenderedState(html);
  if (jsonResult && jsonResult.results.length > 0) {
    return jsonResult;
  }
  return parseFromHtml(html);
}

function extractPrerenderedListing(html: string): any | null {
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
    return data?.listing?.listing || null;
  } catch {
    return null;
  }
}

function parseFromPrerenderedState(html: string): ParsedSearchPage | null {
  const listing = extractPrerenderedListing(html);
  if (!listing || !Array.isArray(listing.ads)) return null;

  const results: SearchResult[] = listing.ads
    .filter((ad: any) => ad.id)
    .map(mapPrerenderedAd);

  return {
    totalCount: listing.totalElements ?? 0,
    totalPages: listing.totalPages ?? null,
    source: 'prerendered',
    results,
  };
}

function parseFromHtml(html: string): ParsedSearchPage {
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
    const priceText = priceEl.contents().filter((_, node) => node.type === 'text').text().trim() || priceEl.text().trim();
    const priceValue = parseFloat(priceText.replace(/[^\d,.]/g, '').replace(/\s/g, '').replace(',', '.'));

    const locationDate = card.find('[data-testid="location-date"]').text().trim();
    const location = locationDate.split(' - ')[0]?.trim() || '';

    const hasDelivery = card.find('[data-testid="card-delivery-badge"], [data-testid="free-delivery-tag"]').length > 0;

    if (id || title) {
      results.push({
        id,
        title,
        description: '',
        price: {
          value: Number.isFinite(priceValue) ? priceValue : null,
          currency: 'PLN',
          display: priceText,
          negotiable: priceText.toLowerCase().includes('negocj'),
          previousValue: null,
        },
        location,
        coordinates: null,
        condition: null,
        isPromoted: false,
        isBusiness: false,
        categoryId: null,
        hasDelivery,
        photos: [],
        seller: { id: null, name: '', memberSince: '' },
        postedAt: null,
        refreshedAt: null,
        url,
      });
    }
  });

  return { totalCount, totalPages: null, source: 'html', results };
}
