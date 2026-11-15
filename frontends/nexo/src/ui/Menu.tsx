import { useEffect, useRef, useState, type ReactNode } from 'react';
export function Menu({ label, name = label, children }: { label: string; name?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    const panel = ref.current!.lastElementChild as HTMLElement;
    const rect = panel.getBoundingClientRect();
    panel.style.transform = `translateX(${Math.max(0, 4 - rect.left) - Math.max(0, rect.right - innerWidth + 4)}px)`;
    panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className="menu-wrap" ref={ref} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} aria-label={name} data-tip={label === name ? undefined : name} aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
    {open && <div className="menu" role="group" aria-label={name} onClick={e => { if ((e.target as HTMLElement).closest('button')) { setOpen(false); trigger.current?.focus(); } }}>{children}</div>}
  </div>;
}
