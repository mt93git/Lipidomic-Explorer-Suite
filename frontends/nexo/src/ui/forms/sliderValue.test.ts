import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchemaForm } from './SchemaForm.jsx';

// Chart audit b06 (volcano Alpha / Label Top N / weights, violin Plot height): Team's sliderInput prints the current
// value; a bare <input type=range> in the Inspector did not, so the user could not see what they were setting.
const form = (control: Record<string, unknown>) => renderToStaticMarkup(createElement(SchemaForm, {
  schema: { controls: [control], actions: [], tabs: {} } as never, sessionId: 's', instanceId: 'i',
  onUpdated: async () => {}, onStatus: () => {},
}));

it('a single-value slider shows its current value, tied to the slider', () => {
  const html = form({ id: 'pointAlpha', type: 'range', label: 'Alpha:', min: 0, max: 1, step: 0.05, default: 0.7 });
  expect(html).toMatch(/<input id="pointAlpha" type="range"/);
  expect(html).toMatch(/<output[^>]*for="pointAlpha"[^>]*>0\.7<\/output>/);
});

it('the value shown is the saved value, not the default', () => {
  const html = form({ id: 'labelThreshold', type: 'range', label: 'Label Top N (or %):', min: 1, max: 50, step: 1, default: 10, value: 25 });
  expect(html).toMatch(/<output[^>]*for="labelThreshold"[^>]*>25<\/output>/);
});
