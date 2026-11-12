import { createElement, lazy, type ComponentProps, type ComponentType } from 'react';
const failed = new Set<() => void>();
/** React.lazy keeps a rejected import (a chunk that failed to load offline) and throws it on every render. This one keeps
 *  it until retryFailedImports(), then drops it, so the next render imports again. (Dropping it at once would make React's
 *  own retry import again and again while offline, and the panel would never say it failed.) */
export function retryLazy<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  const make = () => lazy(() => load().catch((error: unknown) => { failed.add(() => { current = make(); }); throw error; }));
  let current = make();
  return (props: ComponentProps<T>) => createElement(current, props);
}
/** PanelBoundary's Try again and the browser coming back online: every failed import runs again on its next render. */
export function retryFailedImports() { for (const retry of failed) retry(); failed.clear(); }
