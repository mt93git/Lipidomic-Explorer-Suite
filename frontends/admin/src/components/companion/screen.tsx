"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Screen } from "./model";

// A page that is more than one screen for the companion says which one it is now (the client's order: Accepted is the
// shipping screen, Released the results screen). The top bar's companion reads it instead of the path's screen while
// the page is shown. Nexo reads its Inspector tab from the DOM instead; Admin's pages stream in after the path changes.
let current: Screen | null = null;
const listeners = new Set<() => void>();
const set = (screen: Screen | null) => { current = screen; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useScreenOverride = () => useSyncExternalStore(subscribe, () => current, () => null);

export function CompanionScreen({ screen }: { screen: Screen }) {
  useEffect(() => { set(screen); return () => set(null); }, [screen]);
  return null;
}
