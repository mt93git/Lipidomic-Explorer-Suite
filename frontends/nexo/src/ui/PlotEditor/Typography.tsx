import type { EditorLayout } from '../../state/document';
import { FONTS, layoutSchema } from '../../editor/editorState';
import { ELEMENTS, familyPatch, resetScalePatch, setBasePatch, setElementPatch, typographyOf, type Element } from '../../editor/typography';
import { Field, LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
import { strings as s } from '../strings';
const SIZE = layoutSchema['font.size'];
const SIZE_KEYS = new Set<string>(['font.family', 'font.size', 'title.font.family', ...Object.values(ELEMENTS).flat()]);
const LABELS: Record<Element, string> = { title: s.typeTitle, axisTitles: s.typeAxisTitles, ticks: s.typeTicks, legend: s.typeLegend };
/** F3: family, base size and a per-element scale; the rest of the old "Title and fonts" fields stay below. */
export default function Typography(p: PlotEditorProps & { onMatchFonts?: () => void }) {
  const t = typographyOf(p.editor, p.figure), patch = (layout: EditorLayout) => p.onChange({ type: 'layoutPatch', patch: layout });
  return <details className="typography" open><summary>{s.typographyHeading}</summary>
    <Field label={s.typeFamily} spec={{ type: 'text', choices: FONTS }} value={t.family} onChange={v => patch(familyPatch(String(v)))} />
    <Field label={s.typeBase} spec={SIZE} value={t.base} onChange={v => patch(setBasePatch(p.editor, p.figure, Number(v)))} />
    <fieldset className="typography-scale"><legend>{s.typeScale}</legend>
      {(Object.keys(ELEMENTS) as Element[]).map(e => <Field key={e} label={`${LABELS[e]} (${Math.round(t.sizes[e] / t.base * 100) / 100}×)`} spec={SIZE} value={t.sizes[e]} onChange={v => patch(setElementPatch(e, Number(v)))} />)}
    </fieldset>
    {p.onMatchFonts && <button type="button" onClick={p.onMatchFonts}>{s.matchFonts}</button>}
    <button type="button" onClick={() => patch(resetScalePatch(t.base))}>{s.resetScale}</button>
    <LayoutFields {...p} keys={Object.keys(layoutSchema).filter(k => (k.startsWith('title.') || k.startsWith('font.')) && !SIZE_KEYS.has(k))} />
  </details>;
}
