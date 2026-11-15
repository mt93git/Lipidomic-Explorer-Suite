// A card's PDF, as Team's plot exports make it (www/team/js/plot_exports.js): one page of the export size, the plot's
// PNG filling it (a raster image in a PDF). jsPDF is the vendored copy the figure page export already loads.
type JsPdf = new (options: object) => { addImage: (...args: unknown[]) => void; output: (type: string) => Blob };
async function loadJsPdf(): Promise<JsPdf> {
  const win = window as unknown as { jspdf?: { jsPDF: JsPdf } };
  if (!win.jspdf) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = import.meta.env.BASE_URL + 'vendor/jspdf.umd.min.js'; script.onload = () => resolve(); script.onerror = () => reject(Error('PDF library could not load')); document.head.append(script); });
  return win.jspdf!.jsPDF;
}
const pt = (mm: number) => mm / 25.4 * 72;
export async function pngPdf(png: Blob, widthMm: number, heightMm: number, JsPDF?: JsPdf): Promise<Blob> {
  const w = pt(widthMm), h = pt(heightMm), Pdf = JsPDF ?? await loadJsPdf();
  const pdf = new Pdf({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
  pdf.addImage(new Uint8Array(await png.arrayBuffer()), 'PNG', 0, 0, w, h, undefined, 'FAST');
  return pdf.output('blob');
}
