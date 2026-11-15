import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInScreen } from './SignInScreen';
test('sign in starts with password and a destination', () => {
  vi.stubGlobal('location', new URL('https://example.test/nexo/?project=synthetic'));
  const html = renderToStaticMarkup(<SignInScreen onSignedIn={() => {}} />);
  expect(html).toContain('Your analysis starts here');
  expect(html).toContain('Forgot password?');
  expect(html).toContain('/admin/forgot-password?next=');
  expect(html).not.toContain('6-digit code');
  vi.unstubAllGlobals();
});
test('the bar names the app Lipidomic Explorer, not Nexo', () => {
  vi.stubGlobal('location', new URL('https://example.test/nexo/'));
  const html = renderToStaticMarkup(<SignInScreen onSignedIn={() => {}} />);
  expect(html).toContain('Lipidomic Explorer'); expect(html).not.toMatch(/>Nexo</);
  vi.unstubAllGlobals();
});
// UX review 3, group A. Read from disk: vitest replaces imported CSS with an empty module. The selector repeats shell.css's
// `input:not([type=checkbox]):not([type=radio]):not([type=color])` (0,3,1) plus the card, so the card's rule wins.
const fsName = 'node:fs';
const { readFileSync } = await import(fsName) as { readFileSync: (path: URL, encoding: string) => string };
const css = readFileSync(new URL('./SignInScreen.css', import.meta.url), 'utf8');
const field = '.entry-signin-card input:not([type=checkbox]):not([type=radio]):not([type=color])';
const rule = (text: string) => text.slice(text.indexOf(`${field} {`)).split('}')[0];
test('sign-in fields use the entry field height', () => {
  expect(rule(css)).toContain('height: var(--field-h, 40px);');
});
test('sign-in field border is the 3:1 field token', () => {
  expect(rule(css)).toContain('border: 1px solid var(--field, #7d8a99);');
});
test('sign-in field text is 16 px on touch', () => {
  expect(css).toContain(`@media (pointer: coarse) { ${field} { font-size: 16px; } }`);
});
test('first-time sign-in sends people to choose a password, not back to a sign-in page', () => {
  vi.stubGlobal('location', new URL('https://example.test/nexo/'));
  const html = renderToStaticMarkup(<SignInScreen onSignedIn={() => {}} />);
  expect(html).toContain('First time here?');
  expect(html).toContain('href="/admin/forgot-password?next=%2Fnexo%2F"');
  expect(html).not.toContain('/admin/sign-in?next=');
  vi.unstubAllGlobals();
});
