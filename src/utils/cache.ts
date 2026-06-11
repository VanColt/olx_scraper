import { LRUCache } from 'lru-cache';

type Loader<T> = () => Promise<T>;

export interface Cache<T> {
  getOrFetch(key: string, loader: Loader<T>): Promise<T>;
}

/**
 * TTL cache with stale-while-revalidate semantics: expired entries are served
 * immediately while a background refresh runs, and stale data is served when
 * the upstream fetch fails (graceful degradation when OLX blocks us).
 */
export function createCache<T extends {}>(opts: { max?: number; ttl: number }): Cache<T> {
  const cache = new LRUCache<string, T, Loader<T>>({
    max: opts.max ?? 500,
    ttl: opts.ttl,
    allowStale: true,
    allowStaleOnFetchRejection: true,
    allowStaleOnFetchAbort: true,
    fetchMethod: (_key, _stale, { context }) => context(),
  });

  return {
    async getOrFetch(key: string, loader: Loader<T>): Promise<T> {
      // lru-cache can resolve undefined instead of rejecting when the
      // fetchMethod throws and no stale value exists — keep the original
      // error (e.g. an axios 404) so routes can map it properly.
      let loadError: unknown;
      const tracked: Loader<T> = async () => {
        try {
          return await loader();
        } catch (err) {
          loadError = err;
          throw err;
        }
      };
      const value = await cache.fetch(key, { context: tracked });
      if (value === undefined) {
        throw loadError ?? new Error('Cache loader returned no value');
      }
      return value;
    },
  };
}

const ttlSecondsFromEnv = (name: string, fallback: number) =>
  parseInt(process.env[name] || String(fallback), 10) * 1000;

export const searchCache = createCache<object>({ ttl: ttlSecondsFromEnv('SEARCH_CACHE_TTL_S', 180) });
export const productCache = createCache<object>({ ttl: ttlSecondsFromEnv('PRODUCT_CACHE_TTL_S', 1800) });
export const categoriesCache = createCache<object>({ ttl: ttlSecondsFromEnv('CATEGORIES_CACHE_TTL_S', 86400) });
// Slug→id resolutions (cities, regions, categories) practically never change.
export const locationsCache = createCache<object>({ ttl: ttlSecondsFromEnv('CATEGORIES_CACHE_TTL_S', 86400) });
