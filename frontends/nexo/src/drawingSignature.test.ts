import { describe, expect, it } from 'vitest';
import { hashBytes, hashText, imageSignature, rememberImage } from './drawingSignature';
describe('drawing signature', () => {
  it('same bytes, same signature; one byte changed, another', () => {
    expect(hashBytes(new Uint8Array([1, 2, 3]))).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
    expect(hashText('abc')).toBe(hashBytes(new TextEncoder().encode('abc')));
  });
  it('blob URLs are looked up by the bytes recorded at fetch; data URLs hash themselves', async () => {
    await rememberImage('blob:a', new Blob([new Uint8Array([9, 9])]));
    await rememberImage('blob:b', new Blob([new Uint8Array([9, 9])]));
    expect(imageSignature('blob:a')).toBe(imageSignature('blob:b'));
    expect(imageSignature('blob:unknown')).toBeUndefined();
    expect(imageSignature('data:image/png;base64,AAAA')).toBe(hashText('data:image/png;base64,AAAA'));
  });
});
