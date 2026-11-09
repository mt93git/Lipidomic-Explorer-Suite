import { describe, it, expect } from 'vitest';
import { sanitizeModalHtml } from './modalHtml';
// A module's showModal body, shown in Nexo's dialog: a safe subset only (Feature 1c).
describe('sanitizeModalHtml', () => {
  it('keeps text and the allowed structure', () => {
    expect(sanitizeModalHtml('<h4>Title</h4><p>One<br>two <strong>b</strong> <em>i</em></p><ul><li>x</li></ul><ol><li>y</li></ol>'))
      .toBe('<h4>Title</h4><p>One<br>two <strong>b</strong> <em>i</em></p><ul><li>x</li></ul><ol><li>y</li></ol>');
    expect(sanitizeModalHtml('<table class="t"><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>'))
      .toBe('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
  });
  it('keeps only class on div and span', () => {
    expect(sanitizeModalHtml('<div class="stats-console" id="x" style="color:red" data-x="1"><span class="badge bg-primary" title="t">C</span></div>'))
      .toBe('<div class="stats-console"><span class="badge bg-primary">C</span></div>');
    expect(sanitizeModalHtml('<div class="a&quot; onclick=&quot;x">t</div>')).toBe('<div>t</div>');
  });
  it('drops scripts, styles, inline handlers and navigating links', () => {
    const out = sanitizeModalHtml('<p onclick="alert(1)">Hi</p><script>alert(1)</script><style>p{}</style><a href="javascript:alert(1)">go</a><a href="https://example.com">site</a><img src=x onerror=alert(1)><iframe src="x"></iframe><svg><script>1</script></svg><!-- c --><template>t</template>');
    expect(out).toBe('<p>Hi</p>gosite');
    expect(out).not.toMatch(/script|onclick|onerror|href|<a|<img|iframe/);
  });
  it('drops form controls but keeps their visible text', () => {
    expect(sanitizeModalHtml('<label>Dark <input type="checkbox" onchange="x()"></label><button onclick="y()">Copy</button>')).toBe('Dark Copy');
  });
  // Chart audit b08 (N2): Team's Statistics Console report is a <pre> (97_statistics_module.R show_statistics_modal);
  // without it the report's lines ran together into one paragraph. The tag is kept bare (no id, class or style).
  it('keeps a console <pre> with its line breaks and no attributes', () => {
    expect(sanitizeModalHtml('<pre id="stats_modal_pre_text" class="stats-console-pre" style="color:#fff" onclick="x()">### Report\n**Class**: GL_TAG\n\n=====</pre>'))
      .toBe('<pre>### Report\n**Class**: GL_TAG\n\n=====</pre>');
    expect(sanitizeModalHtml('<pre><script>alert(1)</script>a &lt; b</pre>')).toBe('<pre>a &lt; b</pre>');
  });
  it('escapes stray markup and keeps entities', () => {
    expect(sanitizeModalHtml('a < b &amp; c > d &lt;script&gt;')).toBe('a &lt; b &amp; c &gt; d &lt;script&gt;');
    expect(sanitizeModalHtml('<pre>x</pre><code>y</code>')).toBe('<pre>x</pre>y');
    expect(sanitizeModalHtml('<<script>script>alert(1)<</script>/script>')).not.toMatch(/<script/);
    expect(sanitizeModalHtml('')).toBe('');
  });
});
