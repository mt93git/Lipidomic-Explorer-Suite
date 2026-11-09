/** LRU of image renders (blob: or data: URLs) with an entry and a byte budget. Evicted blob: URLs are revoked. */
export interface ImageCacheOptions { maxBytes?: number; maxEntries?: number; revoke?: (url: string) => void }
export interface ImageCache {
  get(key: string): string | undefined;
  set(key: string, url: string, bytes: number): void;
  /** Cached URL, or one shared load per key; a failed load is not cached. */
  load(key: string, fetch: () => Promise<{ url: string; bytes: number }>): Promise<string>;
  keys(): string[];
  bytes(): number;
}
export function createImageCache({ maxBytes = 48 * 1024 * 1024, maxEntries = 64, revoke = url => URL.revokeObjectURL(url) }: ImageCacheOptions = {}): ImageCache {
  // Map iteration order is insertion order: the first key is the least recently used.
  const entries = new Map<string, { url: string; bytes: number }>(), pending = new Map<string, Promise<string>>();
  let total = 0;
  const drop = (key: string) => {
    const entry = entries.get(key); if (!entry) return;
    entries.delete(key); total -= entry.bytes;
    if (entry.url.startsWith('blob:')) revoke(entry.url);
  };
  const cache: ImageCache = {
    get(key) {
      const entry = entries.get(key); if (!entry) return undefined;
      entries.delete(key); entries.set(key, entry); return entry.url;
    },
    set(key, url, bytes) {
      const old = entries.get(key);
      if (old?.url === url) { entries.delete(key); total -= old.bytes; } else drop(key);
      entries.set(key, { url, bytes }); total += bytes;
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries && total <= maxBytes) break;
        if (oldest !== key) drop(oldest);
      }
    },
    load(key, fetch) {
      const hit = cache.get(key); if (hit) return Promise.resolve(hit);
      let wait = pending.get(key);
      if (!wait) {
        wait = fetch().then(({ url, bytes }) => { cache.set(key, url, bytes); return url; }).finally(() => pending.delete(key));
        pending.set(key, wait);
      }
      return wait;
    },
    keys: () => [...entries.keys()],
    bytes: () => total,
  };
  return cache;
}
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
const round8 = (n: number) => Math.max(8, Math.round(n / 8) * 8);
/** (instance or node id, inputs hash, width and height rounded to 8 px, revision; "@2x" for a Retina render). */
export function imageKey({ id, inputs, width, height, revision, dpr = 1 }: { id: string; inputs: unknown; width: number; height: number; revision: unknown; dpr?: number }) {
  return [id, hash(JSON.stringify(inputs) ?? ''), round8(width), round8(height), String(revision), ...(dpr !== 1 ? [`@${dpr}x`] : [])].join('|');
}
/** Shared by every card: returning to a card or resizing back does not refetch. */
export const imageCache = createImageCache();
