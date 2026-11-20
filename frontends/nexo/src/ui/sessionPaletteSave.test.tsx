// Gerardo 2026-11-19: the session palette has Team's two annotation contexts (Lipid class, Lipid category) and Team's
// "Save & reuse" block (Save palette, Download JSON, Import palette JSON).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaletteView } from './SessionPalette';
import { paletteImportClash, paletteSaveName, parsePaletteRecord, type SessionPalette } from '../palette/sessionPalette';
import { phrases } from './strings';
import { mockPaletteExport, mockPaletteGet, mockPalettePut, mockPaletteOpened, mockPaletteSaved } from '../mock/palette';
const palette = (active = 'Default'): SessionPalette => ({ active, shapesEditable: false,
  state: { useCustomColors: false, customColors: {}, activePalette: active },
  palettes: [{ name: 'Default', kind: 'default', colors: [] }, { name: 'Tableau Classic', kind: 'preset', colors: [] }, { name: 'Lab figures', kind: 'saved', colors: [] }],
  contexts: [{ id: 'Group1', label: 'Sample groups (Group 1)', groups: [{ name: 'Control', color: '#377EB8' }] }] });
const noop = () => {};
describe('Save & reuse', () => {
  it('shows Team\'s block with Save palette, Download JSON and Import palette JSON when the panel wires them', () => {
    const html = renderToStaticMarkup(<PaletteView palette={palette()} busy={false} onPalette={noop} onColour={noop} onSave={noop} onDownload={noop} onImport={noop}/>);
    for (const text of ['Save &amp; reuse', 'Save current colors as', 'Save palette', 'Download JSON', 'Import palette JSON']) expect(html).toContain(text);
    expect(html).toMatch(/<button type="button" disabled="">Save palette/);
  });
  it('without handlers the block is not shown (read-only views)', () => {
    expect(renderToStaticMarkup(<PaletteView palette={palette()} busy={false} onPalette={noop} onColour={noop}/>)).not.toContain('Save palette');
  });
  it('a save name follows Team\'s rule: 1-80 characters, not Default, a preset or another saved palette', () => {
    expect(paletteSaveName(palette(), '  My figure  ')).toBe('My figure');
    for (const bad of ['', '   ', 'Default', 'Tableau Classic', 'Lab figures', 'x'.repeat(81)]) expect(paletteSaveName(palette(), bad), bad).toBeNull();
    expect(paletteSaveName(palette('Lab figures'), 'Lab figures')).toBe('Lab figures');
  });
  it('an import whose name is already listed is explained, not sent (staging demo 2026-11-19)', () => {
    const colors = { 'Group1::Control': '#AA3300' };
    for (const taken of ['Lab figures', 'Default', 'Tableau Classic']) expect(paletteImportClash(palette(), { name: taken, colors }), taken).toBe(taken);
    expect(paletteImportClash(palette(), { name: 'Lab figures 2', colors })).toBeNull();
    expect(phrases.paletteImportExists('Lab figures')).toMatch(/already exists.*rename it.*choose another file/);
  });
  it('an imported file must be a name and a map of #RRGGBB colours', () => {
    expect(parsePaletteRecord('{"name":" Mine ","colors":{"Group1::Control":"#aa3300"}}')).toEqual({ name: 'Mine', colors: { 'Group1::Control': '#AA3300' } });
    for (const bad of ['nope', '[]', '{"name":"x"}', '{"name":"","colors":{"a":"#000000"}}', '{"name":"x","colors":{"a":"red"}}', '{"name":"x","colors":{}}'])
      expect(parsePaletteRecord(bad), bad).toBeNull();
  });
});
describe('mock: annotation contexts and Save & reuse, as palette.R', () => {
  it('lists Lipid class and Lipid category; a class colour is Team\'s Apply on that context', () => {
    const id = 'palette-class-session', got = mockPaletteGet(id);
    expect(got.contexts.map(c => c.label)).toEqual(['Sample groups (Group 1)', 'Lipid class', 'Lipid category']);
    const next = mockPalettePut(id, { context: 'Lipid Class', colors: { PC: '#123456' } });
    expect(next.state.customColors['Lipid Class::PC']).toBe('#123456');
    expect(next.contexts.find(c => c.id === 'Lipid Class')!.groups.find(g => g.name === 'PC')!.color).toBe('#123456');
    expect(() => mockPalettePut(id, { context: 'Hyperclass', colors: { PC: '#123456' } })).toThrow(/Unknown group/);
  });
  it('save, export and import: saved palettes are listed, active, and travel with the checkpoint', () => {
    const id = 'palette-save-session';
    mockPalettePut(id, { context: 'Group1', colors: { Control: '#aa3300' } });
    const before = mockPaletteGet(id).state;
    const saved = mockPalettePut(id, { save: 'Lab figures' });
    expect(saved.active).toBe('Lab figures');
    // A save only records the palette: the colour state (and so every plot's colours) stays as it was.
    expect(saved.state.customColors).toEqual(before.customColors);
    expect(saved.state.useCustomColors).toBe(before.useCustomColors);
    expect(saved.palettes.find(p => p.name === 'Lab figures')?.kind).toBe('saved');
    expect(() => mockPalettePut(id, { save: 'Default' })).toThrow(/unique palette name/);
    const ex = mockPaletteExport(id);
    expect(ex).toMatchObject({ filename: 'Lab_figures.json', record: { name: 'Lab figures' } });
    expect(ex.record.colors['Group1::Control']).toBe('#AA3300');
    const imported = mockPalettePut(id, { import: { name: 'From Paula', colors: { ...ex.record.colors, 'Group1::Control': '#0A0B0C' } } });
    expect(imported.active).toBe('From Paula');
    expect(imported.state.customColors['Group1::Control']).toBe('#0A0B0C');
    expect(() => mockPalettePut(id, { import: { name: 'From Paula', colors: ex.record.colors } })).toThrow(/unique palette name/);
    mockPaletteSaved(id, 'palette-save-checkpoint'); mockPaletteOpened('palette-save-checkpoint', 'palette-save-reopened');
    expect(mockPaletteGet('palette-save-reopened').palettes.filter(p => p.kind === 'saved').map(p => p.name)).toEqual(['Lab figures', 'From Paula']);
  });
});
