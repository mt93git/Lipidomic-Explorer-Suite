import { useEffect, useId, useRef, type ReactNode } from 'react';
import { strings as s } from '../strings';
export function Confirm({ title, children, onConfirm, onCancel, destructive = false }: { destructive?: boolean; title: string; children: ReactNode; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-labelledby={id} onCancel={e => { e.preventDefault(); onCancel(); }}><h2 id={id}>{title}</h2>{children}<footer><button onClick={onCancel}>{s.cancel}</button><button className={destructive ? "primary danger" : "primary"} onClick={onConfirm}>{s.confirm}</button></footer></dialog>;
}
