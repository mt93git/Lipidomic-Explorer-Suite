import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { TopBar } from './TopBar';
test('account menu offers sign out', () => {
  const html = renderToStaticMarkup(<TopBar projectName="Synthetic" onCheckpoints={() => {}} saveText="Ready" saveStatus="idle"/>);
  expect(html).toContain('Sign out');
});
