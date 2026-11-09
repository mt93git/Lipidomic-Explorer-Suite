/** An <img> just put in a card (a new render, e.g. the 2x image asked when a card is focused on a Retina screen)
 * decodes asynchronously: wait for it, at most `timeoutMs`. True when the image has pixels. */
export async function imageReady(img: { complete: boolean; naturalWidth: number; decode(): Promise<void> }, timeoutMs = 5000): Promise<boolean> {
  if (img.complete && img.naturalWidth > 0) return true;
  if (!img.complete) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([img.decode().catch(() => undefined), new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
    clearTimeout(timer);
  }
  return img.complete && img.naturalWidth > 0;
}
