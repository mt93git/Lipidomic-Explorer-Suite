import { useEffect, useState } from 'react';
import { colourReport, filterValues, SIMULATIONS, seriesColours, type Simulation } from './colourBlind';
import type { Figure } from '../../editor/applyEditor';
import { proStrings as s } from '../strings';
const LABELS: Record<Simulation | 'normal', string> = { normal: 'Normal', deuteranopia: 'Deuteranopia', protanopia: 'Protanopia', tritanopia: 'Tritanopia', greyscale: 'Greyscale' };
const DEFS = 'nexo-cvd-filters';
function ensureFilters() {
  if (document.getElementById(DEFS)) return;
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.id = DEFS; svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  for (const kind of SIMULATIONS) { const f = document.createElementNS(ns, 'filter'), m = document.createElementNS(ns, 'feColorMatrix');
    f.id = `nexo-cvd-${kind}`; f.setAttribute('color-interpolation-filters', 'linearRGB'); m.setAttribute('type', 'matrix'); m.setAttribute('values', filterValues(kind)); f.append(m); svg.append(f); }
  document.body.append(svg);
}
const cardOf = (id: string) => document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`);
/** F7: preview the card through a colour-vision simulation (never saved or exported) and report series colour clashes. */
export default function ColourBlindCheck({ id, figure }: { id: string; figure?: Figure }) {
  const [sim, setSim] = useState<Simulation | 'normal'>('normal');
  useEffect(() => { const el = cardOf(id); if (!el) return; if (sim !== 'normal') { ensureFilters(); el.style.filter = `url(#nexo-cvd-${sim})`; el.dataset.cvdPreview = sim; }
    return () => { el.style.filter = ''; delete el.dataset.cvdPreview; }; }, [id, sim]);
  const report = figure ? colourReport(seriesColours(figure)) : null;
  const line = !report ? s.colourBlindImage : report.ok ? s.colourBlindAllOk : 'few' in report ? s.colourBlindFew : s.colourBlindClose(report.a, report.b, LABELS[report.simulation], report.deltaE);
  const summary = !report ? LABELS[sim] : report.ok ? s.colourBlindOk : 'few' in report ? LABELS[sim] : `deltaE ${report.deltaE.toFixed(0)} · check`;
  return <details className="plot-editor pro-colour-blind"><summary>{s.colourBlind} <span className="pro-summary">{summary}</span></summary>
    <p>{s.colourBlindNote}</p>
    <div className="plot-editor-chips" role="group" aria-label={s.colourBlind}>{(['normal', ...SIMULATIONS] as const).map(k => <button key={k} type="button" aria-pressed={sim === k} onClick={() => setSim(k)}>{LABELS[k]}</button>)}</div>
    <p role="status" className={report?.ok ? 'pro-ok' : report && !('few' in report) ? 'pro-warn' : undefined}>{line}</p>
  </details>;
}
