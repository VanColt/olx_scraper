import { describe, expect, it } from 'vitest';
import { ProductDetail } from '../src/schemas';
import { ApartmentCriteria, extractApartmentFacts, matchesCriteria } from '../src/scripts/findApartments';

const product: ProductDetail = {
  id: '1',
  title: 'Mieszkanie 2-pokojowe we Wrzeszczu',
  description: 'Jasne mieszkanie z balkonem, bez pośredników.',
  price: { value: 3200, currency: 'PLN', display: '3 200 zł', negotiable: false, previousValue: null },
  condition: null,
  parameters: { Powierzchnia: '48,5 m²', 'Liczba pokoi': '2 pokoje', 'Czynsz (dodatkowo)': '750 zł' },
  photos: [],
  location: 'Gdańsk, Wrzeszcz',
  coordinates: null,
  categoryId: 15,
  isBusiness: false,
  postedAt: null,
  refreshedAt: null,
  validTo: null,
  seller: { id: '7', name: 'Anna', memberSince: '' },
  url: 'https://www.olx.pl/d/oferta/1',
};

const criteria: ApartmentCriteria = {
  mode: 'rent', city: 'Gdańsk', distance: 0, query: 'mieszkanie',
  minPrice: 2500, maxPrice: 3500, minArea: 40, maxArea: 55,
  rooms: [2], maxAdditionalFees: 800, districts: ['wrzeszcz'],
  requiredPhrases: ['balkon'], excludedPhrases: ['krótkoterminowy'],
  privateOnly: true, searchLimit: 100, resultLimit: 30, sort: 'newest',
};

describe('apartment filters', () => {
  it('extracts localized numeric parameters', () => {
    expect(extractApartmentFacts(product)).toEqual({ areaM2: 48.5, rooms: 2, additionalFees: 750 });
  });

  it('matches against parameters and the full description', () => {
    expect(matchesCriteria(product, criteria)).toBe(true);
    expect(matchesCriteria(product, { ...criteria, requiredPhrases: ['winda'] })).toBe(false);
    expect(matchesCriteria(product, { ...criteria, excludedPhrases: ['pośredników'] })).toBe(false);
  });

  it('rejects an offer when a requested structured value is missing', () => {
    const withoutArea = { ...product, parameters: { 'Liczba pokoi': '2' } };
    expect(matchesCriteria(withoutArea, criteria)).toBe(false);
  });
});
