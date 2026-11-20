// Mock of frontends/nexo-api/palette.R: Team's session palette (data hub "Colors & palettes"), session-wide, never per
// card. Synthetic Group 1 levels (the dashboard mock traces' names); Team's defaults (initialize_color_map, Set1) and
// Team's presets (R/utils_colors.R COLOR_PALETTE_PRESETS). Kept per session; travels with a saved checkpoint as
// Team's state.json color_shape does.
import type { PaletteChange, PaletteRecord, PaletteState, SessionPalette } from '../palette/sessionPalette';
import { validatePaletteState } from '../palette/sessionPalette';
export const mockPaletteGroups = ['Case', 'Control'];
const defaults: Record<string, string> = { Case: '#E41A1C', Control: '#377EB8' };
// Team's annotation contexts (Lipid class = anno$subclass, Lipid category = anno$hyperclass) with synthetic classes and
// Team-like defaults (CLASS_MAP_COLORS / HYPERCLASS_MAP_COLORS stand-ins).
const CLASS_CONTEXTS: { id: string; label: string; defaults: Record<string, string> }[] = [
  { id: 'Lipid Class', label: 'Lipid class', defaults: { Cer: '#E7298A', PC: '#1B9E77', PE: '#D95F02', TG: '#7570B3' } },
  { id: 'Hyperclass', label: 'Lipid category', defaults: { GL: '#E41A1C', GP: '#377EB8', SP: '#4DAF4A' } }];
export const MOCK_PRESETS: Record<string, string[]> = {
  'Tableau Classic': ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'],
  'Ocean & Coral': ['#155E75', '#0E7490', '#06B6D4', '#0D9488', '#F97373', '#E76F51', '#A8558E', '#F0B45B'],
  'Earth & Garden': ['#365314', '#65A30D', '#A3A635', '#B45309', '#C2410C', '#0F766E', '#7C3AED', '#78716C'],
  'Colorblind Friendly': ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#000000']
};
const key = 'nexo-mock-palette-v1';
const fresh = (): PaletteState => ({ useCustomColors: false, customColors: {}, activePalette: 'Default' });
const bySession = new Map<string, PaletteState>();
let byCheckpoint: Record<string, PaletteState & { saved?: Record<string, PaletteRecord> }> = {};
// Team's color_palettes (Save palette / Import palette JSON), per session; saved with the checkpoint as Team does.
const savedBySession = new Map<string, Record<string, PaletteRecord>>();
const savedOf = (session: string) => savedBySession.get(session) ?? {};
try { const v = JSON.parse(sessionStorage.getItem(key) ?? '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) byCheckpoint = v; } catch { /* A stale mock cache must not block boot. */ }
export const mockPaletteCounters = { patches: [] as PaletteChange[] };
const stateOf = (session: string) => bySession.get(session) ?? fresh();
const keyOf = (group: string) => `Group1::${group}`;
/** Team's masterColorMaps for Group 1: the custom colour when useCustomColors, else the default. */
export function mockPaletteColour(session: string, group: string): string {
  const s = stateOf(session); return (s.useCustomColors && s.customColors[keyOf(group)]) || defaults[group];
}
/** The colour a group-coloured mock render shows for this group, only when the session palette changed it. */
export function mockPaletteOverride(session: string, group: string): string | undefined {
  const s = stateOf(session); return s.useCustomColors ? s.customColors[keyOf(group)] : undefined;
}
const classColour = (session: string, context: string, label: string) => {
  const s = stateOf(session), def = CLASS_CONTEXTS.find(c => c.id === context)!.defaults[label];
  return ((s.useCustomColors && s.customColors[`${context}::${label}`]) || def).toUpperCase();
};
/** Team's palette_current_colors(): every context's colours keyed "<context>::<label>". */
function currentColours(session: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of mockPaletteGroups) out[keyOf(g)] = mockPaletteColour(session, g).toUpperCase();
  for (const c of CLASS_CONTEXTS) for (const label of Object.keys(c.defaults)) out[`${c.id}::${label}`] = classColour(session, c.id, label);
  return out;
}
export function mockPaletteGet(session: string): SessionPalette {
  const s = stateOf(session);
  return { active: s.activePalette, shapesEditable: false, state: structuredClone(s),
    palettes: [{ name: 'Default', kind: 'default', colors: [] }, ...Object.entries(MOCK_PRESETS).map(([name, colors]) => ({ name, kind: 'preset' as const, colors: colors.slice(0, 10) })),
      ...Object.values(savedOf(session)).map(r => ({ name: r.name, kind: 'saved' as const, colors: [...new Set(Object.values(r.colors))].slice(0, 10) }))],
    contexts: [{ id: 'Group1', label: 'Sample groups (Group 1)', groups: mockPaletteGroups.map(g => ({ name: g, color: mockPaletteColour(session, g).toUpperCase(), shape: null })) },
      ...CLASS_CONTEXTS.map(c => ({ id: c.id, label: c.label, groups: Object.keys(c.defaults).sort().map(label => ({ name: label, color: classColour(session, c.id, label), shape: null })) }))] };
}
/** Team's Download JSON (palette.R api_palette_export). */
export function mockPaletteExport(session: string): { filename: string; record: PaletteRecord } {
  const name = stateOf(session).activePalette;
  return { filename: `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.json`,
    record: { name: name === 'Default' || MOCK_PRESETS[name] ? `${name} copy` : name, colors: currentColours(session) } };
}
// Team's palette_validate_record: 1-80 characters, not Default or a preset, not another saved palette's name.
function validRecord(session: string, record: unknown, oldName?: string): PaletteRecord {
  const r = (record ?? {}) as Record<string, unknown>, name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || name.length > 80 || name === 'Default' || MOCK_PRESETS[name] || (savedOf(session)[name] && name !== oldName)) bad('Choose a unique palette name (1–80 characters).');
  const colors = r.colors as Record<string, unknown>;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors) || !Object.keys(colors).length || !Object.values(colors).every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))
    bad('Palette colors must be a named map of #RRGGBB values.');
  return { name, colors: Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, String(c).toUpperCase()])) };
}
const bad = (message: string) => { throw Object.assign(new Error(message), { status: 400, error: 'api_bad_request' }); };
export function mockPalettePut(session: string, body: unknown): SessionPalette {
  const b = (body ?? {}) as Record<string, unknown>, kinds = ['palette', 'context', 'restore', 'save', 'import'].filter(k => k in b);
  if (kinds.length !== 1) bad('Expected exactly one of palette, context (with colors), restore, save or import.');
  const s = structuredClone(stateOf(session));
  if (kinds[0] === 'palette') {
    const name = b.palette;
    if (name === 'Default') Object.assign(s, { useCustomColors: false, customColors: {} });
    else if (typeof name === 'string' && MOCK_PRESETS[name]) Object.assign(s, { useCustomColors: true, customColors: Object.fromEntries([
      ...mockPaletteGroups.map((g, i) => [keyOf(g), MOCK_PRESETS[name][i % MOCK_PRESETS[name].length]]),
      ...CLASS_CONTEXTS.flatMap(c => Object.keys(c.defaults).sort().map((label, i) => [`${c.id}::${label}`, MOCK_PRESETS[name][i % MOCK_PRESETS[name].length]]))]) });
    else if (typeof name === 'string' && savedOf(session)[name]) Object.assign(s, { useCustomColors: true, customColors: structuredClone(savedOf(session)[name].colors) });
    else bad('Unknown palette.');
    s.activePalette = name as string;
  } else if (kinds[0] === 'context') {
    const cls = CLASS_CONTEXTS.find(c => c.id === b.context);
    if (b.context !== 'Group1' && !cls) bad('Unknown colour context.');
    const colors = b.colors as Record<string, unknown>;
    if (!colors || typeof colors !== 'object' || !Object.keys(colors).length) bad('Expected colors as a map of group to #RRGGBB.');
    const groups = cls ? Object.keys(cls.defaults) : mockPaletteGroups;
    const unknown = Object.keys(colors).filter(g => !groups.includes(g)); if (unknown.length) bad(`Unknown group: ${unknown.join(', ')}`);
    if (!Object.values(colors).every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) bad('Colours must be #RRGGBB.');
    // Team's Apply: every field of the context, the edited ones new, the others as the editor shows them.
    if (cls) for (const g of groups) s.customColors[`${cls.id}::${g}`] = String(colors[g] ?? classColour(session, cls.id, g)).toUpperCase();
    else for (const g of mockPaletteGroups) s.customColors[keyOf(g)] = String(colors[g] ?? mockPaletteColour(session, g)).toUpperCase();
    s.useCustomColors = true;
  } else if (kinds[0] === 'save' || kinds[0] === 'import') {
    // Save palette records the colours shown now; Import palette JSON takes the file's. Either becomes the active palette.
    const record = kinds[0] === 'save'
      ? validRecord(session, { name: typeof b.save === 'string' ? b.save : '', colors: currentColours(session) }, s.activePalette)
      : validRecord(session, b.import);
    savedBySession.set(session, { ...savedOf(session), [record.name]: record });
    // palette.R: a save only records the palette (the colour state stays, the saved one is named active); an import applies it.
    if (kinds[0] === 'save') s.activePalette = record.name;
    else Object.assign(s, { useCustomColors: true, customColors: structuredClone(record.colors), activePalette: record.name });
  } else {
    const restored = validatePaletteState(b.restore); if (!restored) bad('Expected a palette state to restore.');
    Object.assign(s, restored);
  }
  bySession.set(session, s); mockPaletteCounters.patches.push(structuredClone(body) as PaletteChange);
  return mockPaletteGet(session);
}
export function mockPaletteSaved(session: string, checkpoint: string) {
  const s = bySession.get(session), saved = savedOf(session);
  if (s && (s.useCustomColors || s.activePalette !== 'Default' || Object.keys(saved).length)) byCheckpoint[checkpoint] = { ...structuredClone(s), saved: structuredClone(saved) }; else delete byCheckpoint[checkpoint];
  try { sessionStorage.setItem(key, JSON.stringify(byCheckpoint)); } catch { /* Quota: the mock keeps it in memory. */ }
}
export const mockPaletteOpened = (checkpoint: string, session: string) => {
  const { saved, ...state } = structuredClone(byCheckpoint[checkpoint] ?? fresh()) as PaletteState & { saved?: Record<string, PaletteRecord> };
  bySession.set(session, state); savedBySession.set(session, saved ?? {});
};
/** What Team's export writes for the palette (state.json color_shape), for the mock's checkpoint ZIP. */
export function mockPaletteTeamState(checkpoint: string): { color_shape: { custom_colors: Record<string, string>; useCustomColors: boolean; active_palette: string } } | undefined {
  const s = byCheckpoint[checkpoint]; if (!s) return undefined;
  return { color_shape: { custom_colors: structuredClone(s.customColors), useCustomColors: s.useCustomColors, active_palette: s.activePalette } };
}
