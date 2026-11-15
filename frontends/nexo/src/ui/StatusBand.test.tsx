// ENTRY-INT step 8: the board's notice ("Prepared by X · settings" and the undecided-sample banner) sits in the status
// band after the dataset summary, as in the prototype's hint bar, whoever looks at the board.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
const mode = vi.hoisted(() => ({ readOnly: false, reason: null as null | 'role' | 'device' }));
vi.mock('../state/readonly', () => ({ isReadOnly: () => mode.readOnly, readOnlyReason: () => mode.reason }));
vi.mock('../collab/roles', () => ({ currentRole: () => ({ role: 'commenter' }), subscribeRole: () => () => {} }));
import { StatusBand } from './StatusBand';
afterEach(() => { mode.readOnly = false; mode.reason = null; });
const notice = <b className="synthetic-notice">Prepared by Ana</b>;
it('the notice follows the dataset summary in the band', () => {
  expect(renderToStaticMarkup(<StatusBand summary="76 lipids · 6 samples" notice={notice}/>)).toMatch(/76 lipids · 6 samples<\/span><b class="synthetic-notice">/);
});
it('a role-limited board keeps the notice in its band', () => {
  mode.readOnly = true; mode.reason = 'role';
  expect(renderToStaticMarkup(<StatusBand notice={notice}/>)).toContain('synthetic-notice');
});
it('a view-only device shows a band with the notice alone', () => {
  mode.readOnly = true; mode.reason = 'device';
  expect(renderToStaticMarkup(<StatusBand notice={notice}/>)).toMatch(/^<div class="status-band"><b class="synthetic-notice">/);
  expect(renderToStaticMarkup(<StatusBand/>)).toBe('');
});
// ENTRY-INT-2: the role's sentence stays its own element beside the notice ("You can comment" is read and found alone).
it('a commenter\'s band says the role in its own element before the notice', () => {
  mode.readOnly = true; mode.reason = 'role';
  expect(renderToStaticMarkup(<StatusBand notice={notice}/>)).toBe('<div class="status-band" role="status"><span>You can comment</span><b class="synthetic-notice">Prepared by Ana</b></div>');
});
it('a commenter still sees what the dataset session prepared', () => {
  mode.readOnly = true; mode.reason = 'role';
  expect(renderToStaticMarkup(<StatusBand summary="76 lipids · 5 samples" notice={notice}/>)).toBe('<div class="status-band" role="status"><span class="dataset-summary">76 lipids · 5 samples</span><span>You can comment</span><b class="synthetic-notice">Prepared by Ana</b></div>');
});
