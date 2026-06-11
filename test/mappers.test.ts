import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { mapApiAd, cleanPhotoUrl } from '../src/scrapers/mappers';
import { SearchResultSchema } from '../src/schemas';

const apiResponse = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'search-api-response.json'), 'utf-8'),
);

describe('mapApiAd', () => {
  const results = apiResponse.data.map(mapApiAd);

  it('maps every fixture ad to a schema-valid SearchResult', () => {
    for (const result of results) {
      const check = SearchResultSchema.safeParse(result);
      expect(check.success, JSON.stringify(check.success ? null : check.error.issues)).toBe(true);
    }
  });

  it('extracts numeric prices with currency from params', () => {
    const priced = results.filter((r: any) => r.price.value !== null);
    expect(priced.length).toBeGreaterThan(0);
    for (const r of priced) {
      expect(r.price.currency).toBe('PLN');
      expect(r.price.display).toMatch(/zł/);
    }
  });

  it('returns ISO 8601 dates', () => {
    const dated = results.find((r: any) => r.postedAt);
    expect(dated.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes a truncated description so agents can classify without detail fetches', () => {
    const described = results.filter((r: any) => r.description.length > 0);
    expect(described.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.description.length).toBeLessThanOrEqual(301); // 300 + ellipsis
      expect(r.description).not.toMatch(/<[^>]+>/);
    }
  });

  it('surfaces price drops via previousValue', () => {
    // The fixture contains ads where the seller lowered the price.
    const dropped = results.filter((r: any) => r.price.previousValue !== null);
    expect(dropped.length).toBeGreaterThan(0);
    for (const r of dropped) {
      expect(r.price.previousValue).toBeGreaterThan(r.price.value);
    }
  });

  it('exposes the seller id for seller-listings lookups', () => {
    const withSeller = results.filter((r: any) => r.seller.id);
    expect(withSeller.length).toBeGreaterThan(0);
    expect(withSeller[0].seller.id).toMatch(/^\d+$/);
  });

  it('includes up to 2 cleaned photo URLs and seller info', () => {
    const withPhotos = results.find((r: any) => r.photos.length > 0);
    expect(withPhotos).toBeDefined();
    for (const r of results) {
      expect(r.photos.length).toBeLessThanOrEqual(2);
      for (const photo of r.photos) expect(photo).not.toMatch(/;s=/);
    }
    expect(results.some((r: any) => r.seller.name)).toBe(true);
  });

  it('matches snapshot for the first ad', () => {
    expect(results[0]).toMatchSnapshot();
  });
});

describe('cleanPhotoUrl', () => {
  it('strips fixed-size and template suffixes', () => {
    expect(cleanPhotoUrl('https://x.olxcdn.com/files/abc/image;s=216x152;q=80')).toBe('https://x.olxcdn.com/files/abc/image');
    expect(cleanPhotoUrl('https://x.olxcdn.com/files/abc/image;s={width}x{height}')).toBe('https://x.olxcdn.com/files/abc/image');
  });
});
