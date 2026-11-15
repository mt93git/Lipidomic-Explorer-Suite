/**
 * A module dialog's body (showModal) as Nexo shows it: a safe subset of its markup only.
 * Text, p, br, strong, em, pre (Team's console reports), lists, tables and headings; div and span keep a plain class. Every
 * other tag is dropped (its text kept), and scripts, styles and embedded content go with their content.
 * The output holds only tags written here, so attributes, handlers and links never get through.
 */
const KEEP = new Set(['p','br','strong','em','pre','ul','ol','li','table','thead','tbody','tr','th','td','h1','h2','h3','h4','h5','h6','div','span']);
const CLASSED = new Set(['div','span']);
const DROP = new Set(['script','style','template','iframe','object','embed','noscript','svg','math','textarea','select','title','head']);
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/;
const ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/;
function escapeText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<') out += '&lt;'; else if (ch === '>') out += '&gt;'; else if (ch === '"') out += '&quot;';
    else if (ch === '&') { const m = ENTITY.exec(text.slice(i)); if (m) { out += m[0]; i += m[0].length - 1; } else out += '&amp;'; }
    else out += ch;
  }
  return out;
}
function classOf(attributes: string): string {
  const m = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributes);
  const value = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
  return /^[A-Za-z0-9_ -]+$/.test(value) ? value.replace(/\s+/g, ' ') : '';
}
export function sanitizeModalHtml(html: string): string {
  let out = '', i = 0, text = '';
  const flush = () => { out += escapeText(text); text = ''; };
  while (i < html.length) {
    if (html[i] !== '<') { text += html[i++]; continue; }
    if (html.startsWith('<!--', i)) { const end = html.indexOf('-->', i + 4); i = end < 0 ? html.length : end + 3; continue; }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) { const end = html.indexOf('>', i); i = end < 0 ? html.length : end + 1; continue; }
    const m = TAG.exec(html.slice(i));
    if (!m) { text += html[i++]; continue; }
    flush(); i += m[0].length;
    const closing = m[1] === '/', name = m[2].toLowerCase();
    if (DROP.has(name)) {
      if (closing) continue;
      // Skip everything up to the matching close tag (or the end).
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      if (end < 0) { i = html.length; continue; }
      const close = html.indexOf('>', end); i = close < 0 ? html.length : close + 1; continue;
    }
    if (!KEEP.has(name)) continue;
    if (name === 'br') { if (!closing) out += '<br>'; continue; }
    if (closing) { out += `</${name}>`; continue; }
    const cls = CLASSED.has(name) ? classOf(m[3]) : '';
    out += cls ? `<${name} class="${cls}">` : `<${name}>`;
  }
  flush();
  return out;
}
