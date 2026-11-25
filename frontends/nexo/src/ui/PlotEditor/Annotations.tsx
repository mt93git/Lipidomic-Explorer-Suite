import { useState } from 'react';
import { Field, labelFor } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
import { NexoArrows, NexoShapes, addArrow, addShape } from './NexoExtras';
import type { Nexo } from './NexoStyle';
import { Icon } from '../Icon';
import { inspectorStrings as is, strings as s } from '../strings';
export type AnnotationKind = 'text' | 'arrow' | 'line' | 'band';
const KINDS: [AnnotationKind, string][] = [['text', is.addText], ['arrow', is.addArrow], ['line', is.addLine], ['band', is.addBand]];
/** "Add ▾": text, arrow, reference line, shaded band (the last three are Nexo style, in data coordinates). */
export function AnnotationAddMenu({ open, onAdd, available = ['text', 'arrow', 'line', 'band'], disabled = [] }: { open: boolean; onAdd: (kind: AnnotationKind) => void;
  available?: AnnotationKind[]; disabled?: AnnotationKind[] }) {
  return open ? <div className="menu style-add-menu" role="group" aria-label={is.add}>{KINDS.filter(([k]) => available.includes(k)).map(([k, label]) =>
    <button type="button" key={k} disabled={disabled.includes(k)} onClick={() => onAdd(k)}>{label}</button>)}</div> : null;
}
export const annotationCount = (p: PlotEditorProps) => (p.editor.annotations?.length ?? 0) + (p.nexoStyle?.annotations?.length ?? 0) + (p.nexoStyle?.shapes?.length ?? 0);
/** One Annotations section: the Add menu, then every text annotation, arrow, reference line and band. */
export default function Annotations({ nexo, ...p }: PlotEditorProps & { nexo?: Nexo }) {
  const [open, setOpen] = useState(false), annotations = p.editor.annotations ?? [];
  const add = (kind: AnnotationKind) => { setOpen(false);
    if (kind === 'text') p.onChange({ type: 'annotations', annotations: [...annotations, { text: 'Annotation', x: .5, y: .5, xref: 'paper', yref: 'paper', showarrow: false, font: { size: 14, color: '#17375e' } }] });
    else if (nexo && kind === 'arrow') addArrow(nexo); else if (nexo) addShape(nexo, kind === 'line' ? 'line' : 'rect'); };
  const full: AnnotationKind[] = [...(annotations.length >= 30 ? ['text' as const] : []), ...((nexo?.style.annotations?.length ?? 0) >= 30 ? ['arrow' as const] : []), ...((nexo?.style.shapes?.length ?? 0) >= 50 ? ['line' as const, 'band' as const] : [])];
  const dataItems = !!nexo && ((nexo.style.annotations?.length ?? 0) + (nexo.style.shapes?.length ?? 0)) > 0;
  return <>
    <div className="menu-wrap style-add" onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{is.add}<Icon name="down"/></button>
      <AnnotationAddMenu open={open} onAdd={add} available={nexo ? ['text', 'arrow', 'line', 'band'] : ['text']} disabled={full}/>
    </div>
    {!annotationCount(p) && <p>{is.noAnnotations}</p>}
    {annotations.map((a, i) => <fieldset key={i}><legend>{is.textAnnotation} {i + 1}</legend>{(['text', 'x', 'y', 'size', 'color'] as const).map(k => <Field key={k} label={k === 'color' ? s.nexoColor : labelFor(k)} value={k === 'size' || k === 'color' ? a.font[k] : a[k]} spec={k === 'text' ? { type: 'text' } : k === 'color' ? { type: 'color' } : { type: 'number', min: k === 'size' ? 6 : 0, max: k === 'size' ? 72 : 1 }} onChange={v => p.onChange({ type: 'annotations', annotations: annotations.map((b, j) => j === i ? (k === 'size' || k === 'color' ? { ...b, font: { ...b.font, [k]: v } } : { ...b, [k]: v }) : b) })}/>)}<button type="button" onClick={() => p.onChange({ type: 'annotations', annotations: annotations.filter((_, j) => i !== j) })}>Remove annotation</button></fieldset>)}
    {dataItems && <p>{s.nexoDataCoordinates}</p>}
    {nexo && <NexoArrows nexo={nexo}/>}
    {nexo && <NexoShapes nexo={nexo}/>}
  </>;
}
