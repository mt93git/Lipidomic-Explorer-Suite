import { useContext, useEffect, useState } from 'react';
import { CanvasHandleContext } from '../canvas/handle';
import { strings as s, keys, tip } from './strings';
export function ZoomPill() {
  const handle = useContext(CanvasHandleContext);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const hud = document.getElementById('hud'), zoom = document.getElementById('zoom') as HTMLSelectElement | null;
    if (!hud || !zoom) return;
    const sync = () => setScale(Number(zoom.value));
    const observer = new MutationObserver(sync); observer.observe(hud, { childList: true, subtree: true, characterData: true }); sync();
    return () => observer.disconnect();
  }, []);
  const change = (value: number) => handle?.zoomTo(value);
  return <div className="zoom-pill" aria-label={s.zoom}><button aria-label={s.zoomOut} aria-keyshortcuts="-" data-tip={tip(s.zoomOut, keys.zoomOut)} onClick={() => change(scale / 1.25)}>{s.minus}</button><span>{Math.round(scale * 100)}{s.percent}</span><button aria-label={s.zoomIn} aria-keyshortcuts="+" data-tip={tip(s.zoomIn, keys.zoomIn)} onClick={() => change(scale * 1.25)}>{s.plus}</button><button onClick={() => handle?.fit()} title={s.fitHelp}>{s.fit}</button><button onClick={() => handle?.resetZoom()} title={s.resetZoomShortcut}>{s.hundred}</button></div>;
}
