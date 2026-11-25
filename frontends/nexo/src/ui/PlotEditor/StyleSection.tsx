import { useCallback, useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { STYLE_SECTIONS, openSections, rememberSections, type StyleSectionId } from './styleSections';
/** Which Style sections are open, remembered per browser (Colours only by default). */
export function useOpenSections(): [(id: StyleSectionId) => boolean, (id: StyleSectionId, open: boolean) => void] {
  const [open, setOpen] = useState<StyleSectionId[]>(() => openSections());
  const toggle = useCallback((id: StyleSectionId, now: boolean) => setOpen(list => {
    if (list.includes(id) === now) return list;
    const next = now ? [...list, id] : list.filter(x => x !== id);
    rememberSections(next); return next;
  }), []);
  return [(id: StyleSectionId) => open.includes(id), toggle];
}
/** One collapsible Style section: icon, title and a one-line summary of what it holds now. */
export function StyleSection({ id, summary, isOpen, onToggle, children }: { id: StyleSectionId; summary?: string; isOpen: boolean;
  onToggle: (id: StyleSectionId, open: boolean) => void; children: ReactNode }) {
  const meta = STYLE_SECTIONS.find(s => s.id === id)!;
  return <details className="style-section" data-section={id} open={isOpen} onToggle={e => onToggle(id, (e.currentTarget as HTMLDetailsElement).open)}>
    <summary><Icon name={meta.icon}/><span className="style-section-title">{meta.title}</span>{summary ? <span className="pro-summary">{summary}</span> : null}</summary>
    <div className="style-section-body">{children}</div>
  </details>;
}
