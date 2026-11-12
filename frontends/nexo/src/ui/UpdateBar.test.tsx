// New-version bar: shown when the deployed Nexo is newer than the page, Reload reloads, × hides it for that commit only,
// a later deployed commit shows it again. It never reloads by itself.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
// React's hooks as plain state kept across renders; effects are collected and run once on mount.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = hooks.cursor++; if (!(i in hooks.values)) hooks.values[i] = initial; return [hooks.values[i], (v: unknown) => { hooks.values[i] = v; }]; },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); } }));
// The watcher (updateCheck.test.ts) is replaced by a hand that reports a status; the decision stays the real one.
const deploys = vi.hoisted(() => ({ calls: [] as unknown[][], report: (_status: unknown) => {}, stop: () => {} }));
vi.mock('./updateCheck', async original => ({ ...await original<object>(),
  watchDeploys: (build: unknown, url: unknown, report: (status: unknown) => void) => { deploys.calls.push([build, url]); deploys.report = report; return deploys.stop; } }));
const roots = vi.hoisted(() => ({ hosts: [] as unknown[], rendered: [] as unknown[] }));
vi.mock('react-dom/client', () => ({ createRoot: (host: unknown) => { roots.hosts.push(host); return { render: (element: unknown) => { roots.rendered.push(element); } }; } }));
import { UpdateBar, mountUpdateBar } from './UpdateBar';
const BUILD = '1111111111111111111111111111111111111111', NEWER = '2222222222222222222222222222222222222222', LATER = '3333333333333333333333333333333333333333';
const deployed = (commit: string) => ({ state: 'deployed', commit });
const text = (node: any): string => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
function elements(node: any): ReactElement<any>[] { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(elements); return [node, ...elements(node.props?.children)]; }
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => { hooks.values = []; hooks.effects = []; deploys.calls = []; deploys.stop = vi.fn(); roots.hosts = []; roots.rendered = []; reload = vi.fn(); vi.stubGlobal('window', { location: { reload } }); });
afterEach(() => vi.unstubAllGlobals());
let build = BUILD;
function render() { hooks.cursor = 0; hooks.effects = []; return elements(UpdateBar({ build })); }
function mount(commit = BUILD) { build = commit; render(); const cleanups = hooks.effects.map(effect => effect()); return cleanups; }
const bar = (tree: ReactElement<any>[]) => tree.find(e => e.props?.className === 'update-bar');
const button = (tree: ReactElement<any>[], name: string) => tree.find(e => e.type === 'button' && (e.props['aria-label'] ?? text(e)) === name)!;
it('watches deploy-status.json at the client root with the build commit; unmount stops it', () => {
  const cleanups = mount();
  expect(deploys.calls).toEqual([[BUILD, `${import.meta.env.BASE_URL}deploy-status.json`]]);
  expect(cleanups).toContain(deploys.stop);
});
it('nothing before a check, nor for the same commit or another state', () => {
  mount(); expect(bar(render())).toBeUndefined();
  deploys.report(deployed(BUILD)); expect(bar(render())).toBeUndefined();
  deploys.report({ state: 'deploying', commit: NEWER }); expect(bar(render())).toBeUndefined();
});
it('a newer deployed commit shows the bar in a status region, with Reload and a named close button', () => {
  mount(); deploys.report(deployed(NEWER));
  const tree = render(), shown = bar(tree)!;
  expect(shown).toBeDefined();
  expect(tree.find(e => e.props?.role === 'status')).toBeDefined();
  expect(elements(tree.find(e => e.props?.role === 'status'))).toContain(shown);
  expect(text(shown)).toContain('A new version of Nexo is available. Reload to update.');
  const buttons = elements(shown).filter(e => e.type === 'button');
  expect(buttons.map(e => e.props['aria-label'] ?? text(e))).toEqual(['Reload', 'Close the update notice']);
  for (const b of buttons) expect(b.props.type).toBe('button');
  expect(text(buttons[1])).toBe('×');
  expect(reload).not.toHaveBeenCalled();
});
it('Reload reloads the page', () => {
  mount(); deploys.report(deployed(NEWER));
  button(render(), 'Reload').props.onClick();
  expect(reload).toHaveBeenCalledTimes(1);
});
it('× hides the bar for that commit; a later deployed commit shows it again', () => {
  mount(); deploys.report(deployed(NEWER));
  button(render(), 'Close the update notice').props.onClick();
  expect(bar(render())).toBeUndefined();
  deploys.report(deployed(NEWER)); expect(bar(render())).toBeUndefined();
  deploys.report(deployed(LATER)); expect(text(bar(render()))).toContain('A new version of Nexo is available.');
  expect(reload).not.toHaveBeenCalled();
});
it('off without a build commit: no bar and no status region', () => {
  mount(''); deploys.report(deployed(NEWER));
  expect(render()).toEqual([]);
});
it('mountUpdateBar mounts one bar at the top of the page, and nothing without a build commit', () => {
  mountUpdateBar(''); mountUpdateBar(undefined);
  expect(roots.hosts).toEqual([]);
  const host = { tag: 'div' }, prepend = vi.fn();
  vi.stubGlobal('document', { createElement: vi.fn(() => host), body: { prepend } });
  mountUpdateBar(BUILD);
  expect(prepend).toHaveBeenCalledWith(host); expect(roots.hosts).toEqual([host]);
  expect(roots.rendered).toHaveLength(1);
  expect(roots.rendered[0]).toMatchObject({ type: UpdateBar, props: { build: BUILD } });
});
