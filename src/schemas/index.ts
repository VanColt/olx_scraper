import { z } from 'zod';

/**
 * Zod schemas are the single source of truth for API inputs and outputs.
 * Scraped/upstream data is validated against these after mapping so that
 * OLX schema drift fails loudly (logged) instead of silently returning garbage.
 */

export const PriceSchema = z.object({
  value: z.number().nullable(),
  currency: z.string(),
  display: z.string(),
  negotiable: z.boolean(),
  /** Previous asking price when the seller lowered it — null otherwise. */
  previousValue: z.number().nullable(),
});

export const SellerSchema = z.object({
  /** OLX user id — usable with the seller-listings endpoint/tool. */
  id: z.string().nullable(),
  name: z.string(),
  memberSince: z.string(),
});

export const LocationInfoSchema = z.object({
  cityId: z.number().nullable(),
  regionId: z.number().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

export const CoordinatesSchema = z.object({
  lat: z.number(),
  lon: z.number(),
});

export const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Truncated to ~300 chars; fetch the product for the full text. */
  description: z.string(),
  price: PriceSchema,
  location: z.string(),
  coordinates: CoordinatesSchema.nullable(),
  condition: z.string().nullable(),
  isPromoted: z.boolean(),
  isBusiness: z.boolean(),
  categoryId: z.number().nullable(),
  hasDelivery: z.boolean(),
  /** First photos only (full resolution); the product detail has all of them. */
  photos: z.array(z.string()),
  seller: SellerSchema,
  postedAt: z.string().nullable(),
  refreshedAt: z.string().nullable(),
  url: z.string(),
});

export const SearchResponseSchema = z.object({
  totalCount: z.number(),
  visibleTotalCount: z.number().nullable(),
  limit: z.number(),
  offset: z.number(),
  source: z.enum(['api', 'prerendered', 'html']),
  results: z.array(SearchResultSchema),
});

export const ProductDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  price: PriceSchema,
  condition: z.string().nullable(),
  parameters: z.record(z.string(), z.string()),
  photos: z.array(z.string()),
  location: z.string(),
  coordinates: CoordinatesSchema.nullable(),
  categoryId: z.number().nullable(),
  isBusiness: z.boolean(),
  postedAt: z.string().nullable(),
  refreshedAt: z.string().nullable(),
  /** When the listing expires — useful for re-checking saved candidates. */
  validTo: z.string().nullable(),
  seller: SellerSchema,
  url: z.string(),
});

export const CategorySchema = z.object({
  name: z.string(),
  slug: z.string(),
  url: z.string(),
});

export const CategoryNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  /** Full slug path, e.g. "muzyka-edukacja/instrumenty/gitary/gitary-elektryczne". */
  path: z.string(),
  parentId: z.number(),
  level: z.number(),
  children: z.array(z.number()),
});

const booleanParam = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

export const SearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(40),
  offset: z.coerce.number().int().min(0).max(960).default(0),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).default('relevance'),
  min_price: z.coerce.number().nonnegative().optional(),
  max_price: z.coerce.number().nonnegative().optional(),
  has_delivery: booleanParam.optional(),
  condition: z.enum(['new', 'used', 'damaged']).optional(),
  category: z.string().regex(/^[\w-]+$/).optional(),
  /** City name (e.g. "Kraków"), slug, or numeric city id. */
  city: z.string().regex(/^[\wÀ-ſ -]+$/).optional(),
  /** Search radius in km around the city (requires city). */
  distance: z.coerce.number().int().min(0).max(100).optional(),
  /** Region (voivodeship) name, slug, or numeric id. */
  region: z.string().regex(/^[\wÀ-ſ -]+$/).optional(),
});

export type Price = z.infer<typeof PriceSchema>;
export type LocationInfo = z.infer<typeof LocationInfoSchema>;
export type CategoryNode = z.infer<typeof CategoryNodeSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type ProductDetail = z.infer<typeof ProductDetailSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
