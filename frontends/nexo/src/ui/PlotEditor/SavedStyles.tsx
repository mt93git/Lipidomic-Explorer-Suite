import { useRef, useState } from 'react';
import type { Node } from '../../state/document';
import { exportStyles, loadStyles, parseStyles, presetEntries, saveStyle, storeStyles, type SavedStyle } from './stylePresets';
import type { PlotEditorProps } from './PlotEditor';
import { proStrings as s } from '../strings';
/** F6 "My lab style": save, apply to this card or the tab (one undo step), rename, delete, export/import JSON. */
export default function SavedStyles(p: PlotEditorProps) {
  const host = p.styleHost, [styles, setStyles] = useState<SavedStyle[]>(() => loadStyles()), [name, setName] = useState('My lab style'), [size, setSize] = useState(false);
  const [status, setStatus] = useState(''), [applied, setApplied] = useState(''), file = useRef<HTMLInputElement>(null);
  if (!host) return null;
  const { handle, id } = host, nodes = () => handle.getSession().canvas.nodes as unknown as Node[];
  const commit = (next: SavedStyle[]) => { setStyles(next); storeStyles(next); };
  const save = () => { const node = nodes().find(n => n.id === id); if (!node || !name.trim()) return; host.flush();
    const style = saveStyle(name, node, p.figure, p.nexoStyle, size, p.editor); commit([...styles.filter(x => x.name !== style.name), style]); setApplied(style.name); setStatus(s.stylePresetSaved(style.name)); };
  const apply = (style: SavedStyle, tab: boolean) => { host.flush(); const all = nodes(), ids = tab ? handle.tabNodeIds(id) : [id];
    const entries = presetEntries(style, ids.map(i => all.find(n => n.id === i)).filter((n): n is Node => !!n), i => handle.figureOf(i));
    handle.styleNodes(tab ? 'applySavedStyleToTab' : 'applySavedStyle', entries); setApplied(style.name);
    setStatus(tab ? s.stylePresetAppliedTab(style.name, entries.length) : s.stylePresetApplied(style.name)); };
  const rename = (style: SavedStyle) => { const next = window.prompt(s.stylePresetRename, style.name)?.trim(); if (next && next !== style.name) commit(styles.map(x => x === style ? { ...x, name: next.slice(0, 80) } : x).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i)); };
  const download = () => { const url = URL.createObjectURL(new Blob([exportStyles(styles)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = 'nexo-styles.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const upload = async (f: File | undefined) => { if (!f || f.size > 512 * 1024) { setStatus(s.stylePresetImportFailed); return; } const got = parseStyles(await f.text()); if (!got.length) { setStatus(s.stylePresetImportFailed); return; }
    commit([...styles.filter(x => !got.some(g => g.name === x.name)), ...got]); setStatus(s.stylePresetImported(got.length)); };
  return <details className="pro-saved-styles"><summary>{s.stylePresets} <span className="pro-summary">{applied || s.stylePresetNone}</span></summary>
    <p>{s.stylePresetNote}</p>
    {!styles.length && <p>{s.stylePresetEmpty}</p>}
    {styles.length > 0 && <ul className="pro-style-list" aria-label={s.stylePresets}>{styles.map(x => <li key={x.name} aria-current={x.name === applied || undefined}>
      <span>{x.name}</span>
      <button type="button" aria-label={`${s.stylePresetApply} ${x.name}`} onClick={() => apply(x, false)}>{s.stylePresetApply}</button>
      <button type="button" aria-label={`${s.stylePresetApplyTab} ${x.name}`} onClick={() => apply(x, true)}>{s.stylePresetApplyTab}</button>
      <button type="button" aria-label={`${s.stylePresetRename} ${x.name}`} onClick={() => rename(x)}>{s.stylePresetRename}</button>
      <button type="button" aria-label={`${s.stylePresetDelete} ${x.name}`} onClick={() => commit(styles.filter(y => y !== x))}>{s.stylePresetDelete}</button>
    </li>)}</ul>}
    <label>{s.stylePresetName}<input value={name} maxLength={80} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /></label>
    <label>{s.stylePresetIncludeSize}<input type="checkbox" checked={size} onChange={e => setSize(e.target.checked)} /></label>
    <div className="plot-editor-chips"><button type="button" className={styles.length ? undefined : 'primary'} disabled={!name.trim()} onClick={save}>{s.stylePresetSave}</button>
      <button type="button" disabled={!styles.length} onClick={download}>{s.stylePresetExport}</button>
      <button type="button" onClick={() => file.current?.click()}>{s.stylePresetImport}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label={s.stylePresetImport} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></div>
    {status && <p role="status">{status}</p>}
  </details>;
}
