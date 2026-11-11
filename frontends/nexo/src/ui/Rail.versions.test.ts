import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
// UX-B4 (prototype scene 6): in collab mode a clock in the left rail opens Version history; flag off there is none.
const fake = vi.hoisted(() => ({ board: null as null | { url: string; project: string } }));
vi.mock('../collab/mode', () => ({ collab: () => fake.board }));
import { Rail } from './Rail';
import { ui } from './model';
afterEach(() => { fake.board = null; ui({ versionsOpen: false }); });

it('collab: the rail has a Version history button, pressed while the panel is open', () => {
  fake.board = { url: 'wss://synthetic.test/collab/', project: 'synthetic-project' };
  expect(renderToStaticMarkup(createElement(Rail))).toMatch(/aria-label="Version history" aria-pressed="false"/);
  ui({ versionsOpen: true });
  expect(renderToStaticMarkup(createElement(Rail))).toMatch(/aria-label="Version history" aria-pressed="true"/);
});

it('flag off: no Version history button', () => {
  expect(renderToStaticMarkup(createElement(Rail))).not.toContain('Version history');
});
