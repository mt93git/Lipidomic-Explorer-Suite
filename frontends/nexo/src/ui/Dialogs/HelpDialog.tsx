import { useEffect, useId, useRef } from 'react';
import { strings as s } from '../strings';
/** The keyboard and pointer shortcuts the canvas has; Esc closes and focus returns to the opener. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="shortcuts-dialog" aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={id}>{s.help}</h2>
    <p>{s.helpText}</p>
    <h3>{s.helpArrange}</h3><p>{s.helpArrangeText}</p>
    <h3>{s.helpFinish}</h3><p>{s.helpFinishText}</p>
    <h3>{s.helpSave}</h3><p>{s.helpSaveText}</p>
    <footer><button className="primary" autoFocus onClick={onClose}>{s.exportClose}</button></footer>
  </dialog>;
}
