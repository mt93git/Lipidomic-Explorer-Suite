// UX3-C: the entry bar's account, as the board's top bar has it: the person's name and Sign out.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EntryBar } from './EntryBar';
it('signed in: the bar names the person and offers Sign out', () => {
  const html = renderToStaticMarkup(<EntryBar step="data" account="Alex Synthetic"/>);
  expect(html).toContain('Alex Synthetic');
  expect(html).toMatch(/<summary class="avatar" aria-label="Account"/);
  expect(html).toMatch(/<button[^>]*class="account-signout"[^>]*>Sign out<\/button>/);
});
it('no one known: no account', () => {
  expect(renderToStaticMarkup(<EntryBar step="data"/>)).not.toContain('account-menu');
});
