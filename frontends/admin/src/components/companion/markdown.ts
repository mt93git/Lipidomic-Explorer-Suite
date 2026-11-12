// Copied from Nexo frontends/nexo/src/companion at 2ec1f69d; keep in step by hand.
/** Companion answers shown as Team shows them (the analyst's www/team/js/companion_assistant.js, formatAnswer):
 *  plain text kept line by line (CSS pre-wrap), a line that is exactly a section title in bold, a line starting
 *  with "Source: " in italics. Everything is escaped; no other markup is interpreted. */
const SECTION_TITLES = ['Definition', 'Structure', 'Biological function', 'Interactions', 'Relevance', 'New insights'];
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function formatAnswer(text: string): string {
  return String(text).split('\n').map(line => {
    const safe = escape(line);
    return SECTION_TITLES.includes(line) ? `<strong>${safe}</strong>` : /^Source: /.test(line) ? `<em>${safe}</em>` : safe;
  }).join('\n');
}
