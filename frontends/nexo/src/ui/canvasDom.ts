import { strings as s } from './strings';
// Shell-side adjustments to DOM the canvas engine builds (canvas.ts, cards.ts and figure/page.ts stay untouched).
const KEEP_IN_VIEW = new Set(['Data & settings', 'Review', s.tryAgain]);
function sweep(root: HTMLElement, readOnly: boolean) {
  // Pointer-only resize grips: the keyboard resizes with Shift+arrows, so they leave the accessibility tree.
  root.querySelectorAll('.resize-handle:not([aria-hidden])').forEach(el => el.setAttribute('aria-hidden', 'true'));
  root.querySelectorAll('.figure-sheet:not([role])').forEach(el => el.setAttribute('role', 'group'));
  // The labelled viewport needs a role: axe flags a bare aria-label once the tab is empty.
  root.querySelector('#viewport:not([role])')?.setAttribute('role', 'group');
  if (!readOnly) return;
  // View only: card buttons are an allow-list, so a new editing action stays hidden by default.
  root.querySelectorAll<HTMLButtonElement>('.card button').forEach(b => {
    const hide = b.getAttribute('aria-label') !== 'More card actions' && !KEEP_IN_VIEW.has(b.textContent?.trim() ?? '');
    if (b.hidden !== hide) b.hidden = hide;
  });
}
export function watchCanvasDom(root: HTMLElement, readOnly: boolean) {
  sweep(root, readOnly);
  const observer = new MutationObserver(() => sweep(root, readOnly));
  observer.observe(root, { subtree: true, childList: true });
  return () => observer.disconnect();
}
/** Enter on a focused card selects it (Shift+Enter adds), as a click on its body does. */
export function selectOnEnter(event: KeyboardEvent) {
  const card = event.target as HTMLElement;
  if (event.key !== 'Enter' || event.defaultPrevented || !card.classList?.contains('card')) return;
  event.preventDefault();
  // A whole click (down and up at one spot), so below the live zoom Enter also focuses the card like a click does.
  const body = card.querySelector('.body'), init = { bubbles: true, cancelable: true, button: 0, isPrimary: true, shiftKey: event.shiftKey };
  body?.dispatchEvent(new PointerEvent('pointerdown', init)); body?.dispatchEvent(new PointerEvent('pointerup', init));
  card.focus({ preventScroll: true });
}
