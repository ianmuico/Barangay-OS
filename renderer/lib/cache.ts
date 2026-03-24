// Simple in-memory cache with invalidation support

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const TTL = 30_000; // 30 seconds default TTL
let version = 0; // bump to invalidate all caches

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(keyPrefix?: string): void {
  if (keyPrefix) {
    Array.from(cache.keys()).forEach((key) => {
      if (key.startsWith(keyPrefix)) cache.delete(key);
    });
  } else {
    cache.clear();
    version++;
  }
}

export function getCacheVersion(): number {
  return version;
}

// Helper: fetch with cache
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  forceRefresh = false
): Promise<T> {
  if (!forceRefresh) {
    const cached = getCached<T>(key);
    if (cached !== null) return cached;
  }
  const data = await fetcher();
  setCache(key, data);
  return data;
}
