// The header on every page of every PDF Nexo downloads: the Libreros Lab logo (the one the top bar shows, about 9.5 mm
// tall, its own aspect ratio) at the top left, "Lipidomic Explorer" beside it and a thin rule under both, inside the
// top margin. Page content always starts below HEADER_HEIGHT, so the header never overlaps it.
export const A4: [number, number] = [595.28, 841.89];
export const HEADER_HEIGHT = 48, HEADER_MARGIN = 34, PLATFORM = 'Lipidomic Explorer';
const LOGO_TOP = 9, LOGO_HEIGHT = 27, RULE_Y = 42;
export interface PdfDocument {
  addPage: (...args: unknown[]) => unknown; addImage: (...args: unknown[]) => unknown; output: (type: string) => unknown;
  setFont: (...args: unknown[]) => unknown; setFontSize: (size: number) => unknown; setTextColor: (...args: unknown[]) => unknown;
  text: (...args: unknown[]) => unknown; setDrawColor: (...args: unknown[]) => unknown; setLineWidth: (width: number) => unknown; line: (...args: unknown[]) => unknown;
}
export type JsPdf = new (options: object) => PdfDocument;
/** The logo as PNG (jsPDF does not read WebP) with its pixel size, for its aspect ratio. */
export interface Logo { png: string | Uint8Array; width: number; height: number }
export function drawHeader(pdf: PdfDocument, pageWidth: number, logo: Logo | null | undefined, margin = HEADER_MARGIN) {
  const w = logo ? LOGO_HEIGHT * logo.width / logo.height : 0;
  if (logo) pdf.addImage(logo.png, 'PNG', margin, LOGO_TOP, w, LOGO_HEIGHT, 'nexo-lab-logo', 'FAST');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(0, 0, 0);
  pdf.text(PLATFORM, margin + (w ? w + 8 : 0), LOGO_TOP + LOGO_HEIGHT / 2 + 4);
  pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.5); pdf.line(margin, RULE_Y, pageWidth - margin, RULE_Y);
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
