import { useEffect, useId, useRef } from 'react';
import { strings as s, shortcuts } from '../strings';
/** The keyboard and pointer shortcuts the canvas has; Esc closes and focus returns to the opener. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="shortcuts-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={id}>{s.shortcutsTitle}</h2>
    <dl>{shortcuts.map(([keys, action]) => <div key={action}><dt>{keys}</dt><dd>{action}</dd></div>)}</dl>
    <footer><button className="primary" autoFocus onClick={onClose}>{s.exportClose}</button></footer>
  </dialog>;
}
