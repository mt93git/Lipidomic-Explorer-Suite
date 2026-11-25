// A link can open one Style section: the Inspector switches to Style, which opens that section and scrolls to it.
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { clearAppearanceSection, openAppearanceSection, pendingAppearanceSection, revealSection } from './appearanceFocus';
import { SizeSection } from './SizeSection';

afterEach(() => { clearAppearanceSection(); vi.unstubAllGlobals(); });

it('the link switches the inspector to Style and keeps the section until it is opened', () => {
  const events: CustomEvent[] = [];
  vi.stubGlobal('window', { dispatchEvent: (e: CustomEvent) => { events.push(e); return true; } });
  vi.stubGlobal('CustomEvent', class { type: string; detail: unknown; constructor(type: string, init: { detail: unknown }) { this.type = type; this.detail = init.detail; } });
  openAppearanceSection('points');
  expect(events.map(e => [e.type, e.detail])).toEqual([['nexo-inspector-tab', 'Style']]);
  expect(pendingAppearanceSection()).toBe('points');
});

it('revealSection opens and scrolls to the matching section only', () => {
  const points = { open: false, scrollIntoView: vi.fn() };
  const root = { querySelector: (selector: string) => selector.includes('data-section="points"') ? points : null } as unknown as ParentNode;
  expect(revealSection(root, 'points')).toBe(true);
  expect(points.open).toBe(true);
  expect(points.scrollIntoView).toHaveBeenCalledOnce();
  expect(revealSection(root, 'legend')).toBe(false);
});

it('Size & position is the body of Style › Size and layout (the section folds, not the fields)', () => {
  const html = renderToStaticMarkup(createElement(SizeSection, { geometry: { width: 440, height: 330, x: 0, y: 0 }, onSize: () => {}, onPosition: () => {} }));
  expect(html).toMatch(/^<div class="size-section">/);
});
