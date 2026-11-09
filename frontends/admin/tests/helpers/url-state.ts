import { useMemo, useSyncExternalStore } from "react";

// Emulates Next's App Router history integration in jsdom: useSearchParams re-renders after
// history.pushState / replaceState and on popstate, exactly what the overview relies on.
const listeners = new Set<() => void>();
let installed = false;
export function installHistorySync() {
  if (installed) return;
  installed = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History["pushState"]>) => { original(...args); listeners.forEach(listener => listener()); };
  }
  window.addEventListener("popstate", () => listeners.forEach(listener => listener()));
}
export function useSearchParamsMock() {
  const search = useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => window.location.search, () => window.location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}
// jsdom does not navigate on anchor clicks; emulate a client-side navigation for same-app links.
export function navigateOnLinkClick(event: React.MouseEvent) {
  const anchor = (event.target as HTMLElement).closest("a[href]");
  const href = anchor?.getAttribute("href");
  if (!href || !href.startsWith("/")) return;
  event.preventDefault();
  window.history.pushState(null, "", href);
}
