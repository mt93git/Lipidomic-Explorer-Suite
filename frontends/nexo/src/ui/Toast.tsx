import { useEffect, useRef } from 'react';
import { store, useShell } from './model';
import { strings as s } from './strings';
export function Toast() {
  const { toast } = useShell(), ref = useRef<HTMLDivElement>(null);
  const dismiss = () => store.set(v => ({ ...v, toast: null }));
  useEffect(() => {
    if (!toast) return;
    const el = ref.current!;
    let remaining = toast.error ? 9000 : 6000, started = 0, timer: number | undefined;
    let hover = false, focus = false;
    const pause = () => { if (timer !== undefined) { clearTimeout(timer); remaining -= performance.now() - started; timer = undefined; } };
    const resume = () => { if (hover || focus || timer !== undefined) return; started = performance.now(); timer = window.setTimeout(dismiss, Math.max(0, remaining)); };
    const enter = () => { hover = true; pause(); }, leave = () => { hover = false; resume(); };
    const focusIn = () => { focus = true; pause(); }, focusOut = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node)) { focus = false; resume(); } };
    el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave); el.addEventListener('focusin', focusIn); el.addEventListener('focusout', focusOut); resume();
    return () => { pause(); el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); el.removeEventListener('focusin', focusIn); el.removeEventListener('focusout', focusOut); };
  }, [toast]);
  return toast && <div ref={ref} className={`toast ${toast.error ? 'is-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.message}{toast.undo && <><button onClick={() => { toast.undo?.(); dismiss(); }}>{s.undo}</button></>}<button aria-label={s.dismiss} data-tip={s.dismiss} onClick={dismiss}>{s.close}</button></div>;
}
