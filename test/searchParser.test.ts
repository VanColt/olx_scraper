import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { parseSearchResults } from '../src/scrapers/searchParser';
import { SearchResultSchema } from '../src/schemas';

const html = readFileSync(join(__dirname, 'fixtures', 'search-prerendered.html'), 'utf-8');

describe('parseSearchResults (prerendered fallback)', () => {
  const page = parseSearchResults(html);

  it('uses the prerendered-state path', () => {
    expect(page.source).toBe('prerendered');
    expect(page.results.length).toBeGreaterThan(0);
  });

  it('reads totalElements (not the removed totalCount key)', () => {
    expect(page.totalCount).toBeGreaterThan(0);
  });

  it('reads delivery from delivery.rock.active', () => {
    // Fixture was captured from a ?courier=1 search: every ad has delivery.
    expect(page.results.every((r) => r.hasDelivery)).toBe(true);
  });

  it('produces schema-valid results with structured prices and ISO dates', () => {
    for (const result of page.results) {
      const check = SearchResultSchema.safeParse(result);
      expect(check.success, JSON.stringify(check.success ? null : check.error.issues)).toBe(true);
    }
    const priced = page.results.find((r) => r.price.value !== null);
    expect(priced).toBeDefined();
    expect(page.results[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('matches snapshot for the first result', () => {
    expect(page.results[0]).toMatchSnapshot();
  });
});
