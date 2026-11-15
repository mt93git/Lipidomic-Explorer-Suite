import { describe, it, expect, vi } from 'vitest';
import { createImageCache, imageKey } from './imageCache';
const MB = 1024 * 1024;
describe('H7b image cache', () => {
  it('a hit returns the same URL and does not reload', async () => {
    const cache = createImageCache({ revoke: vi.fn() });
    const load = vi.fn(async () => ({ url: 'blob:a', bytes: 10 }));
    expect(await cache.load('a', load)).toBe('blob:a');
    expect(await cache.load('a', load)).toBe('blob:a');
    expect(cache.get('a')).toBe('blob:a');
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('shares one in-flight load per key', async () => {
    const cache = createImageCache({ revoke: vi.fn() });
    const load = vi.fn(async () => ({ url: 'blob:a', bytes: 10 }));
    const [a, b] = await Promise.all([cache.load('a', load), cache.load('a', load)]);
    expect([a, b]).toEqual(['blob:a', 'blob:a']); expect(load).toHaveBeenCalledTimes(1);
  });
  it('evicts the least recently used entry beyond the entry limit and revokes its URL', () => {
    const revoke = vi.fn();
    const cache = createImageCache({ maxEntries: 3, revoke });
    cache.set('a', 'blob:a', 1); cache.set('b', 'blob:b', 1); cache.set('c', 'blob:c', 1);
    cache.get('a');
    cache.set('d', 'blob:d', 1);
    expect(cache.keys()).toEqual(['c', 'a', 'd']);
    expect(revoke).toHaveBeenCalledWith('blob:b'); expect(cache.get('b')).toBeUndefined();
  });
  it('evicts by byte budget (48 MB by default)', () => {
    const revoke = vi.fn();
    const cache = createImageCache({ revoke });
    cache.set('a', 'blob:a', 20 * MB); cache.set('b', 'blob:b', 20 * MB);
    cache.set('c', 'blob:c', 20 * MB);
    expect(cache.keys()).toEqual(['b', 'c']); expect(cache.bytes()).toBe(40 * MB);
    expect(revoke).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith('blob:a');
  });
  it('holds at most 64 entries by default', () => {
    const cache = createImageCache({ revoke: vi.fn() });
    for (let i = 0; i < 70; i++) cache.set(String(i), `blob:${i}`, 1);
    expect(cache.keys()).toHaveLength(64); expect(cache.get('5')).toBeUndefined(); expect(cache.get('6')).toBe('blob:6');
  });
  it('does not revoke data: URLs and revokes a replaced URL', () => {
    const revoke = vi.fn();
    const cache = createImageCache({ maxEntries: 1, revoke });
    cache.set('a', 'data:image/png;base64,AA', 1); cache.set('b', 'blob:b', 1);
    expect(revoke).not.toHaveBeenCalled();
    cache.set('b', 'blob:b2', 1); expect(revoke).toHaveBeenCalledWith('blob:b');
  });
  it('a failed load is not cached', async () => {
    const cache = createImageCache({ revoke: vi.fn() });
    await expect(cache.load('a', async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await cache.load('a', async () => ({ url: 'blob:a', bytes: 1 }))).toBe('blob:a');
  });
  it('keys round width and height to 8 px and change with inputs and revision', () => {
    const base = { id: 'tcinstance_1', inputs: { a: 1 }, width: 401, height: 299, revision: 3 };
    expect(imageKey(base)).toBe(imageKey({ ...base, width: 403, height: 297 }));
    expect(imageKey(base)).not.toBe(imageKey({ ...base, width: 420 }));
    expect(imageKey(base)).not.toBe(imageKey({ ...base, inputs: { a: 2 } }));
    expect(imageKey(base)).not.toBe(imageKey({ ...base, revision: 4 }));
    expect(imageKey(base)).not.toBe(imageKey({ ...base, id: 'tcinstance_2' }));
  });
});
