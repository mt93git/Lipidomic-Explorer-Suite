// Gerardo 2026-11-19: Data links to Appearance › Series, where colours, point borders and shapes live.
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { clearAppearanceSection, openAppearanceSection, pendingAppearanceSection, revealSection } from './appearanceFocus';
import { SizeSection } from './SizeSection';
import { strings as s } from '../strings';

afterEach(() => { clearAppearanceSection(); vi.unstubAllGlobals(); });

it('the link switches the inspector to Appearance and keeps the section until it is opened', () => {
  const events: CustomEvent[] = [];
  vi.stubGlobal('window', { dispatchEvent: (e: CustomEvent) => { events.push(e); return true; } });
  vi.stubGlobal('CustomEvent', class { type: string; detail: unknown; constructor(type: string, init: { detail: unknown }) { this.type = type; this.detail = init.detail; } });
  openAppearanceSection('Series');
  expect(events.map(e => [e.type, e.detail])).toEqual([['nexo-inspector-tab', 'Appearance']]);
  expect(pendingAppearanceSection()).toBe('Series');
});

it('revealSection opens and scrolls to the matching section only', () => {
  const make = (text: string) => { const details = { open: false, scrollIntoView: vi.fn() }; return { details, summary: { textContent: ` ${text} `, parentElement: details } }; };
  const palette = make('Color palette'), series = make('Series');
  const root = { querySelectorAll: () => [palette.summary, series.summary] } as unknown as ParentNode;
  expect(revealSection(root, 'Series')).toBe(true);
  expect(series.details.open).toBe(true);
  expect(series.details.scrollIntoView).toHaveBeenCalledOnce();
  expect(palette.details.open).toBe(false);
  expect(revealSection({ querySelectorAll: () => [] } as unknown as ParentNode, 'Series')).toBe(false);
});

it('Size & position starts folded so the colour sections are in view', () => {
  const html = renderToStaticMarkup(createElement(SizeSection, { geometry: { width: 440, height: 330, x: 0, y: 0 }, onSize: () => {}, onPosition: () => {} }));
  expect(html).toMatch(/^<details class="size-section">/);
  expect(s.appearanceLink).toContain('Appearance');
});
