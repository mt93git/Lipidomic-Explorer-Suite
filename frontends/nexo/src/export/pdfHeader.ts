// The header on every page of every PDF Nexo downloads, as the lab's report header: a full-width dark band at the top
// (#1b2330, 22 pt), the Libreros Lab logo inside it at the left (17 pt tall, its own aspect ratio; its wordmark is white,
// made for a dark bar), "Lipidomic Explorer" in bold white beside it and "Page N of M" in light grey at the right.
// Page content always starts below HEADER_HEIGHT, so the header never overlaps it.
export const A4: [number, number] = [595.28, 841.89];
export const BAND_HEIGHT = 22, HEADER_HEIGHT = BAND_HEIGHT + 6, HEADER_MARGIN = 34, PLATFORM = 'Lipidomic Explorer';
export const BAND_COLOUR: [number, number, number] = [27, 35, 48], PAGE_COLOUR: [number, number, number] = [199, 209, 224];
const LOGO_HEIGHT = 17, INSET = 14;
export interface PdfDocument {
  addPage: (...args: unknown[]) => unknown; addImage: (...args: unknown[]) => unknown; output: (type: string) => unknown;
  setFont: (...args: unknown[]) => unknown; setFontSize: (size: number) => unknown; setTextColor: (...args: unknown[]) => unknown;
  text: (...args: unknown[]) => unknown; setFillColor: (...args: unknown[]) => unknown; rect: (...args: unknown[]) => unknown;
}
export type JsPdf = new (options: object) => PdfDocument;
/** The logo as PNG (jsPDF does not read WebP) with its pixel size, for its aspect ratio. */
export interface Logo { png: string | Uint8Array; width: number; height: number }
export function drawHeader(pdf: PdfDocument, pageWidth: number, logo: Logo | null | undefined, page = 1, pages = 1) {
  const w = logo ? LOGO_HEIGHT * logo.width / logo.height : 0, middle = BAND_HEIGHT / 2;
  pdf.setFillColor(...BAND_COLOUR); pdf.rect(0, 0, pageWidth, BAND_HEIGHT, 'F');
  if (logo) pdf.addImage(logo.png, 'PNG', INSET, (BAND_HEIGHT - LOGO_HEIGHT) / 2, w, LOGO_HEIGHT, 'nexo-lab-logo', 'FAST');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(255, 255, 255);
  pdf.text(PLATFORM, INSET + (w ? w + 8 : 0), middle + 3.7);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...PAGE_COLOUR);
  pdf.text(`Page ${page} of ${pages}`, pageWidth - INSET, middle + 2.8, { align: 'right' });
  pdf.setTextColor(0, 0, 0);
}
let logoLoading: Promise<Logo | null> | undefined;
/** The top bar's WebP logo drawn to a PNG in the browser; null when it cannot load (the header then has the name only). */
export function loadLogo(): Promise<Logo | null> {
  return logoLoading ??= (async () => {
    try {
      const img = new Image(); img.src = `${import.meta.env.BASE_URL}entry/libreros-lab-logo.webp`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      return { png: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
    } catch { logoLoading = undefined; return null; }
  })();
}
