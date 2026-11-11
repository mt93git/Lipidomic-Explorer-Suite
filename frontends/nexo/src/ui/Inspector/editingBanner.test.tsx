// Prototype scene 2 (soft lock): the Inspector says who else is editing the selected card; you may keep going.
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Banner, editorOf } from './EditingBanner';

it('the banner names a lab person editing this card', () => {
  const html = renderToStaticMarkup(<Banner person={{ displayName: 'Tomás Synthetic', kind: 'staff' }}/>);
  expect(html).toContain('Tomás Synthetic is editing this card');
  expect(html).toContain('Lab');
  expect(html).toContain('You can still change it; changes are applied in one order, the later one wins and both of you see the result.');
});

it('the banner says Client for a client member', () => {
  expect(renderToStaticMarkup(<Banner person={{ displayName: 'Dr Lee Synthetic', kind: 'client' }}/>)).toContain('Client');
});

it('the editor is the person whose editing names the card', () => {
  const tomas = { displayName: 'Tomás Synthetic', editing: { nodeId: 'violin', field: 'lipid' } };
  expect(editorOf([{ displayName: 'Ana', editing: { nodeId: 'pca', field: 'x' } }, tomas], 'violin')).toBe(tomas);
});

it('nobody editing the card shows no banner', () => {
  expect(editorOf([{ displayName: 'Ana', editing: null }, { displayName: 'Lee', selection: ['violin'] }], 'violin')).toBeUndefined();
});
