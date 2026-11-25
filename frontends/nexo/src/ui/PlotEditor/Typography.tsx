import type { EditorLayout } from '../../state/document';
import { FONTS, layoutSchema } from '../../editor/editorState';
import { ELEMENTS, familyPatch, resetScalePatch, setBasePatch, setElementPatch, typographyOf, type Element } from '../../editor/typography';
import { Field, LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
import { NexoWeights, type Nexo } from './NexoStyle';
import { strings as s, inspectorStrings as is } from '../strings';
const SIZE = layoutSchema['font.size'];
const SIZE_KEYS = new Set<string>(['font.family', 'font.size', 'title.font.family', ...Object.values(ELEMENTS).flat()]);
const LABELS: Record<Element, string> = { title: s.typeTitle, axisTitles: s.typeAxisTitles, ticks: s.typeTicks, legend: s.typeLegend };
/** "Arial · 12 pt": the Text section's summary. */
export function textSummary(p: PlotEditorProps): string { const t = typographyOf(p.editor, p.figure); return `${t.family} · ${t.base} pt`; }
/** F3 family, base size and per-element scale; then the title weights (Nexo), Match fonts and Reset scale, and the
 *  plot title's own fields. */
export default function Typography(p: PlotEditorProps & { onMatchFonts?: () => void; nexo?: Nexo }) {
  const t = typographyOf(p.editor, p.figure), patch = (layout: EditorLayout) => p.onChange({ type: 'layoutPatch', patch: layout });
  return <>
    <Field label={s.typeFamily} spec={{ type: 'text', choices: FONTS }} value={t.family} onChange={v => patch(familyPatch(String(v)))} />
    <Field label={s.typeBase} spec={SIZE} value={t.base} onChange={v => patch(setBasePatch(p.editor, p.figure, Number(v)))} />
    <fieldset className="typography-scale style-subgroup"><legend>{s.typeScale}</legend>
      {(Object.keys(ELEMENTS) as Element[]).map(e => <Field key={e} label={`${LABELS[e]} (${Math.round(t.sizes[e] / t.base * 100) / 100}×)`} spec={SIZE} value={t.sizes[e]} onChange={v => patch(setElementPatch(e, Number(v)))} />)}
    </fieldset>
    {p.nexo && <fieldset className="style-subgroup"><legend>{is.weights}</legend><NexoWeights nexo={p.nexo}/></fieldset>}
    <div className="plot-editor-chips">{p.onMatchFonts && <button type="button" onClick={p.onMatchFonts}>{s.matchFonts}</button>}
    <button type="button" onClick={() => patch(resetScalePatch(t.base))}>{s.resetScale}</button></div>
    <fieldset className="style-subgroup"><legend>{is.titleFields}</legend><LayoutFields {...p} keys={Object.keys(layoutSchema).filter(k => (k.startsWith('title.') || k.startsWith('font.')) && !SIZE_KEYS.has(k))} /></fieldset>
  </>;
}
