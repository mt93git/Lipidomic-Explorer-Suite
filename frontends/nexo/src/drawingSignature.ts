// Steph review 4b: a short fingerprint of what a card shows, so a session palette change can tell which cards it
// redrew (palette/paletteRedraw.ts). FNV-1a 32-bit: not for security, only "is this the same drawing".
export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return `${bytes.length}:${h.toString(16)}`;
}
export const hashText = (text: string): string => hashBytes(new TextEncoder().encode(text));
// The bytes of each fetched card image, by its object URL (bounded; the image cache revokes old URLs).
const images = new Map<string, string>();
export async function rememberImage(url: string, blob: Blob): Promise<void> {
  try { images.set(url, hashBytes(new Uint8Array(await blob.arrayBuffer()))); } catch { return; }
  if (images.size > 256) images.delete(images.keys().next().value!);
}
/** A blob URL's recorded bytes; a data URL (network snapshots, Plotly previews) is its own content. */
export function imageSignature(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('data:') ? hashText(url) : images.get(url);
}
