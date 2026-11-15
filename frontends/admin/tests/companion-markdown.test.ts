// Copied from Nexo frontends/nexo/src/companion at 2ec1f69d (markdown.test.ts); keep in step by hand.
import { expect, test } from 'vitest';
import { formatAnswer } from '@/components/companion/markdown';
test('answer text escapes raw HTML', () => {
  const html = formatAnswer('<img src=x onerror=alert(1)> & <script>x</script>');
  expect(html).not.toContain('<img'); expect(html).not.toContain('<script');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &lt;script&gt;');
});
test('answer shows section titles in bold and the Source line in italics, as Team does', () => {
  const html = formatAnswer('Good one!\n\nDefinition\nCL is in the inner membrane.\nSource: overview.png/Libreros_lab; disease_notes.png/Libreros_lab');
  expect(html).toContain('<strong>Definition</strong>');
  expect(html).toContain('<em>Source: overview.png/Libreros_lab; disease_notes.png/Libreros_lab</em>');
  expect(html).not.toContain('<strong>Good one!</strong>');
  expect(html.split('\n')).toHaveLength(5);
});
