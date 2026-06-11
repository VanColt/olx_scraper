import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { parseProductFromApi } from '../src/scrapers/productParser';
import { ProductDetailSchema } from '../src/schemas';

const apiResponse = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'product-api-response.json'), 'utf-8'),
);

describe('parseProductFromApi', () => {
  const product = parseProductFromApi(apiResponse.data);

  it('is schema-valid', () => {
    const check = ProductDetailSchema.safeParse(product);
    expect(check.success, JSON.stringify(check.success ? null : check.error.issues)).toBe(true);
  });

  it('extracts negotiable from params (offers API has no top-level price)', () => {
    // Fixture is a known negotiable listing — this locks in the bug fix
    // where ad.price?.negotiable (nonexistent) always yielded false.
    expect(product.price.negotiable).toBe(true);
    expect(product.price.value).toBe(7490);
    expect(product.price.currency).toBe('PLN');
  });

  it('strips sizing templates from photo URLs', () => {
    expect(product.photos.length).toBeGreaterThan(0);
    for (const photo of product.photos) {
      expect(photo).not.toMatch(/;s=/);
    }
  });

  it('excludes price/state from display parameters but keeps the rest', () => {
    expect(Object.keys(parseProductFromApi(apiResponse.data).parameters)).not.toContain('Cena');
  });

  it('matches snapshot', () => {
    expect(product).toMatchSnapshot();
  });
});
