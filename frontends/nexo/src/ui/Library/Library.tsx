import { strings as s, phrases as p } from '../strings';
import {list as illustrations,hiddenIds,dataUrl} from '../../illustrations/assets';
import { useContext, useEffect, useRef, useState } from 'react';
import { getCatalog, type CatalogEntry, type Node } from '../../api';
import { availability, groupCatalog } from '../../catalog';
import { CanvasHandleContext } from '../../canvas/handle';
import { DesignDialog } from '../Dialogs/DesignDialog';
import { openLibrary, ui, useShell } from '../model';
import { filterCatalog, rowState } from './rows';
import { iconFor, sprite } from './icons';
const shortReasons: Record<string, string> = { 'needs-time': s.needsTimePoints, unavailable: s.notForPaired, 'needs-design': '', add: '' };
export { filterCatalog, rowState } from './rows';

export function Library() {
  const handle = useContext(CanvasHandleContext), state = useShell().ui;
  const search = useRef<HTMLInputElement>(null), pending = useRef(new Map<string, AbortController>());
  const [outputs, setOutputs] = useState<CatalogEntry[]>([]), [query, setQuery] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]), [statuses, setStatuses] = useState<Record<string, 'queued' | 'ready' | undefined>>({});
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [designOpen, setDesignOpen] = useState(false);
  const [groups, setGroups] = useState<Record<string, boolean>>({ Dashboard: true });
  const [family, setFamily] = useState('All');
  useEffect(() => {
    let active = true;
    void getCatalog().then(catalog => { if (active) setOutputs(catalog.outputs); }, error => { if (active) setError(String(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!handle) return;
    const sync = () => {
      const next = handle.getSession().canvas.nodes;
      setNodes(previous => previous.length === next.length && previous.every((n, i) => n.id === next[i].id) ? previous : [...next]);
    };
    sync(); return handle.onChange(sync);
  }, [handle]);
  // Focus the search when the user opens or switches the library, not on first load (keyboard order starts at the top bar).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current && state.libraryOpen) search.current?.focus();
    opened.current = true;
  }, [state.libraryOpen, state.library, state.libraryFocus]);
  async function add(entry: CatalogEntry, keyboard = false) {
    if (!handle || pending.current.has(entry.id)) return;
    const available = availability(entry, state.design);
    if (entry.needs === 'de' && !state.design?.allowed) { setDesignOpen(true); return; }
    if (available !== 'add') return;
    const controller = new AbortController(); pending.current.set(entry.id, controller); setStatuses(s => ({ ...s, [entry.id]: 'queued' })); setError('');
    try { await handle.addCard(entry.id, controller.signal); if (controller.signal.aborted) return; ui({ inspectorOpen: true }); setStatuses(s => ({ ...s, [entry.id]: 'ready' })); if (keyboard) requestAnimationFrame(() => document.getElementById(`locate-${entry.id}`)?.focus()); }
    catch (error) { if (controller.signal.aborted) return; setError(error instanceof Error ? error.message : String(error)); setStatuses(s => ({ ...s, [entry.id]: undefined })); }
    finally { if (pending.current.get(entry.id) === controller) pending.current.delete(entry.id); }
  }
  const tab = state.library === 'illustrations' ? 'illustrations' : 'plots';
  const filtered = filterCatalog(outputs, query, family);
  const visibleArt=illustrations.filter(a=>!hiddenIds.has(a.id)&&`${a.title} ${a.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <aside className="library-panel" hidden={!state.libraryOpen} aria-label={s.library}>
    <header><strong>{tab === 'plots' ? s.plotLibrary : s.illustrationLibrary}</strong><button aria-label={s.closeLibraryPanel} data-tip={s.closeLibraryPanel} onClick={() => ui({ libraryOpen: false })}>×</button></header>
    <div className="library-tabs" role="tablist" aria-label={s.libraryContent}>
      {(['plots', 'illustrations'] as const).map((value, i) => <button key={value} id={`library-tab-${value}`} role="tab" aria-controls={`library-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
        onClick={() => { setQuery(''); openLibrary(value); }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'plots' : event.key === 'End' ? 'illustrations' : i ? 'plots' : 'illustrations';
          setQuery(''); openLibrary(next);
        }}>{value === 'plots' ? s.plots : s.illustrations}</button>)}
    </div>
    <input className="library-search" ref={search} type="search" placeholder={tab === 'plots' ? s.searchPlots : s.searchIllustrations} aria-label={tab === 'plots' ? s.searchPlots : s.searchIllustrations} value={query} onChange={e => { setQuery(e.target.value); setFamily('All'); }} onKeyDown={e => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      if (query) setQuery(''); else if (state.inspectorOpen) ui({ inspectorOpen: false });
      else { ui({ libraryOpen: false }); document.getElementById('viewport')?.focus({ preventScroll: true }); }
    }}/>
    {tab === 'plots' && <div className="library-families" role="group" aria-label={s.plotFamilies}>
      {['All', ...groupCatalog(outputs).filter(g => g.count).map(g => g.label)].map(label => <button key={label} aria-pressed={family === label} onClick={() => setFamily(label)}>{label === 'All' ? s.selectAll : label}</button>)}
    </div>}
    <section className="library-results" id="library-panel-plots" role="tabpanel" aria-labelledby="library-tab-plots" hidden={tab !== 'plots'}>
      <div hidden dangerouslySetInnerHTML={{ __html: sprite }}/>
      {loading && <p role="status">{s.loadingPlots}</p>}
      {groupCatalog(filtered).filter(group => group.count).map(group => <details className="library-group" key={group.label} open={!!query.trim() || family !== 'All' || !!groups[group.label]} onToggle={e => {
        if (!query.trim() && family === 'All') { const open = e.currentTarget.open; setGroups(g => g[group.label] === open ? g : { ...g, [group.label]: open }); }
      }}><summary>{group.label}<span>{group.count}</span></summary>
        <div className="tile-grid">{group.entries.map(entry => {
          const count = nodes.filter(node => node.id.endsWith(`-${entry.output}`)).length;
          const row = rowState({ ...entry, status: statuses[entry.id] }, state.design, count);
          const text = count ? p.addedCount(count) : row.state;
          const tooltip = `${entry.description}${row.reason ? ` · ${row.reason}` : ''}`;
          const gated = entry.needs === 'de' && !state.design?.allowed;
          const queued = statuses[entry.id] === 'queued';
          // Wave 1 grid: one tile per plot, icon above the name. The tile itself is the main action (add; locate
          // once on the canvas; confirm the study design when gated); a corner + adds another copy, × cancels.
          // The status words stay in the tile's text for screen readers; the visible caption is the short part.
          const icon = <span className="tile-icon" aria-hidden="true"><svg className="library-icon" width="22" height="22" focusable="false" aria-hidden="true"><use href={`#${iconFor(entry)}`}/></svg>{count > 0 && <span className="tile-count">{count}</span>}</span>;
          const caption = gated ? <small><span className="visually-hidden">{text} · </span>{s.confirmDesignLink}</small>
            : row.state === 'Unavailable' ? <small><span className="visually-hidden">{text} · </span>{shortReasons[availability(entry, state.design)]}</small>
            : row.state === 'Queued' || row.state === 'Ready' ? <small>{text}</small> : null;
          return <article className="library-row tile" key={entry.id} title={tooltip} data-state={row.state} draggable={!!handle && !queued && availability(entry, state.design) === 'add'} onDragStart={e => {
            e.dataTransfer.setData('application/nexo-plot', entry.id); e.dataTransfer.effectAllowed = 'copy';
            const tile = e.currentTarget.querySelector<HTMLElement>('.tile-main'); if (tile) e.dataTransfer.setDragImage(tile, 16, 16);
            window.dispatchEvent(new CustomEvent('nexo-plot-drag', { detail: entry.id }));
          }} onDragEnd={() => window.dispatchEvent(new CustomEvent('nexo-plot-drag', { detail: null }))}>
            {count && handle ? <button type="button" id={`locate-${entry.id}`} className="library-locate tile-main" aria-label={`${text}: ${p.showOnCanvas(entry.label)}`} onClick={() => handle.locateSource(entry.id)}>{icon}<strong>{entry.label}</strong></button>
              : <button type="button" className="library-add tile-main" aria-label={gated ? `${s.confirmDesignLink} (${entry.label})` : `${s.addLabel} ${entry.label}`} disabled={!handle || queued || (!gated && row.state === 'Unavailable')} onClick={e => void add(entry, e.detail === 0)}>{icon}<strong>{entry.label}</strong>{caption}</button>}
            {count > 0 && handle && !queued && <button type="button" className="library-add tile-more" aria-label={`${s.addLabel} ${entry.label}`} title={`${s.addLabel} ${entry.label}`} onClick={e => void add(entry, e.detail === 0)}>+</button>}
            {queued && <button type="button" className="tile-cancel" aria-label={p.cancelAdd(entry.label)} title={p.cancelAdd(entry.label)} onClick={() => { pending.current.get(entry.id)?.abort(); pending.current.delete(entry.id); setStatuses(v => ({ ...v, [entry.id]: undefined })); }}>×</button>}
          </article>;
        })}</div>
      </details>)}
      {!loading && !filtered.length && <div className="library-no-match" role="status"><p>{query.trim() ? p.noPlotMatches(query.trim()) : s.noPlots}</p><button onClick={() => { setQuery(''); setFamily('All'); search.current?.focus(); }}>{s.clearSearch}</button></div>}
    </section>
    <section className="library-results" id="library-panel-illustrations" role="tabpanel" aria-labelledby="library-tab-illustrations" hidden={tab !== 'illustrations'}>
      {[...new Set(visibleArt.map(a=>a.category))].map(category=><section key={category}><h4>{category}</h4>{visibleArt.filter(a=>a.category===category).map(a=><article className="library-row" key={a.id} draggable onDragStart={e=>e.dataTransfer.setData('application/nexo-illustration',a.id)}><img width="70" src={dataUrl(a.id,a.defaultColor)} alt=""/><strong>{a.title}</strong><button className="library-add" aria-label={`${s.addLabel} ${a.title}`} onClick={()=>handle?.addIllustration(a.id)}>+</button></article>)}</section>)}
    </section>
    {tab==='illustrations' && !visibleArt.length && <p>{s.noIllustrations}</p>}
    {tab === 'plots' && <p className="library-drag-hint">{s.dragPlotHint}</p>}
    <p role="alert">{error}</p>
    {designOpen && handle && <DesignDialog sessionId={handle.getSession().sessionId} saved={handle.savedDesign?.()} onClose={() => setDesignOpen(false)} onConfirmed={design => {
      handle.getSession().design = design;
      if (design.allowed) setStatuses(s => ({ ...s, ...Object.fromEntries(outputs.filter(e => e.needs === 'de').map(e => [e.id, 'ready' as const])) }));
    }}/> }
  </aside>;
}
