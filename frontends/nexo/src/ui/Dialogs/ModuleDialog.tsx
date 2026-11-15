import { useEffect, useId, useRef } from 'react';
import { strings as s } from '../strings';
import type { ModuleDialog as Dialog } from '../forms/actions';
/** A dialog a module opened (Team's showModal), shown with its html already sanitised (sanitizeModalHtml). */
export function ModuleDialog({ dialog, onClose }: { dialog: Dialog; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="module-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={id}>{dialog.title || s.moduleDialog}</h2>
    <div className="module-dialog-body" dangerouslySetInnerHTML={{__html: dialog.html}}/>
    <footer><button className="primary" autoFocus onClick={onClose}>{s.exportClose}</button></footer>
  </dialog>;
}
