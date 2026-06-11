import { ProductDetail } from '../schemas';
import { cleanPhotoUrl, absoluteUrl, extractParams, stripHtml } from './mappers';

/**
 * Parse product from the OLX offers API (/api/v1/offers/{id}/).
 * The API has no top-level `price` field — price, negotiability and
 * condition all live inside `params`.
 */
export function parseProductFromApi(ad: any): ProductDetail {
  const { price, condition, parameters } = extractParams(ad.params);

  const photos: string[] = [];
  for (const p of ad.photos || []) {
    const raw = p?.link || p;
    if (typeof raw === 'string') photos.push(cleanPhotoUrl(raw));
  }

  const locationParts = [ad.location?.city?.name, ad.location?.region?.name].filter(Boolean);

  return {
    id: String(ad.id ?? ''),
    title: ad.title || '',
    description: stripHtml(ad.description || ''),
    price,
    condition,
    parameters,
    photos,
    location: ad.location?.pathName || locationParts.join(', '),
    coordinates: typeof ad.map?.lat === 'number' && typeof ad.map?.lon === 'number'
      ? { lat: ad.map.lat, lon: ad.map.lon }
      : null,
    categoryId: ad.category?.id ?? null,
    isBusiness: !!ad.business,
    postedAt: ad.created_time || null,
    refreshedAt: ad.last_refresh_time || null,
    validTo: ad.valid_to_time || null,
    seller: {
      id: ad.user?.id != null ? String(ad.user.id) : null,
      name: ad.contact?.name || ad.user?.name || '',
      memberSince: ad.user?.created || '',
    },
    url: absoluteUrl(ad.url),
  };
}
