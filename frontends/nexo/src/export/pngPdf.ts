// A card's PDF, as Team's plot exports make it (www/team/js/plot_exports.js): the plot's PNG at its export size (a
// raster image in a PDF). Every Nexo PDF is A4 portrait with the lab header, so the plot sits under the header at the
// top left, at its export size (scaled down, shape kept, only when it is larger than the page area).
// jsPDF is the vendored copy the figure page export also loads.
import { A4, HEADER_HEIGHT, HEADER_MARGIN, drawHeader, loadLogo, type JsPdf, type Logo } from './pdfHeader';
export async function loadJsPdf(): Promise<JsPdf> {
  const win = window as unknown as { jspdf?: { jsPDF: JsPdf } };
  if (!win.jspdf) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = import.meta.env.BASE_URL + 'vendor/jspdf.umd.min.js'; script.onload = () => resolve(); script.onerror = () => reject(Error('PDF library could not load')); document.head.append(script); });
  return win.jspdf!.jsPDF;
}
const pt = (mm: number) => mm / 25.4 * 72;
export async function pngPdf(png: Blob, widthMm: number, heightMm: number, JsPDF?: JsPdf, logo?: Logo | null): Promise<Blob> {
  const Pdf = JsPDF ?? await loadJsPdf(), header = logo === undefined ? await loadLogo() : logo;
  const top = HEADER_HEIGHT + 6, room = [A4[0] - 2 * HEADER_MARGIN, A4[1] - top - HEADER_MARGIN];
  const scale = Math.min(1, room[0] / pt(widthMm), room[1] / pt(heightMm)), w = pt(widthMm) * scale, h = pt(heightMm) * scale;
  const pdf = new Pdf({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  drawHeader(pdf, A4[0], header);
  pdf.addImage(new Uint8Array(await png.arrayBuffer()), 'PNG', HEADER_MARGIN, top, w, h, undefined, 'FAST');
  return pdf.output('blob') as Blob;
}
