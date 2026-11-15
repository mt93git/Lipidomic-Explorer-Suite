// Pilot F1: the session palette panel (rail Palettes) shows Team's palettes and the session's group colours, and
// turns a pick into the change Team's editor makes; each change is one undo step that sends the earlier state back.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaletteView } from './SessionPalette';
import { groupColourChange, paletteChoiceChange, samePalette, setSessionPalette, validatePaletteState, type SessionPalette, type WithPalette } from '../palette/sessionPalette';
import { createHistory } from '../state/history';
import { createStore } from '../state/store';
import { mockPaletteGet, mockPalettePut, mockPaletteColour } from '../mock/palette';
const palette = (): SessionPalette => ({ active: 'Default', shapesEditable: false,
  state: { useCustomColors: false, customColors: {}, activePalette: 'Default' },
  palettes: [{ name: 'Default', kind: 'default', colors: [] }, { name: 'Tableau Classic', kind: 'preset', colors: ['#4E79A7', '#F28E2B'] }],
  contexts: [{ id: 'Group1', label: 'Sample groups (Group 1)', groups: [{ name: 'Case', color: '#E41A1C' }, { name: 'Control', color: '#377EB8' }] }] });
describe('PaletteView', () => {
  const html = renderToStaticMarkup(<PaletteView palette={palette()} busy={false} onPalette={() => {}} onColour={() => {}}/>);
  it('lists Team\'s palettes by Team\'s names, the active one pressed', () => {
    expect(html).toContain('Default'); expect(html).toContain('Tableau Classic');
    expect(html).toMatch(/aria-pressed="true"[^>]*>(<[^>]+>)*Default/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>(<[^>]+>)*Tableau Classic/);
  });
  it('one colour picker per group of each context, labelled by group, holding the session colour', () => {
    expect(html).toContain('<fieldset'); expect(html).toContain('Sample groups (Group 1)');
    expect(html).toMatch(/type="color"[^>]*aria-label="Colour for Control"[^>]*value="#377eb8"|aria-label="Colour for Control"[^>]*value="#377eb8"/);
    expect(html).toContain('aria-label="Colour for Case"');
  });
  it('says shapes are not part of Team\'s palette editor', () => { expect(html).toContain('shapes'); });
  it('disables everything while a change is applied', () => {
    expect(renderToStaticMarkup(<PaletteView palette={palette()} busy onPalette={() => {}} onColour={() => {}}/>)).toContain('<fieldset disabled=""');
  });
});
describe('changes as Team\'s editor makes them', () => {
  it('a group colour is one context edit, upper case; the same colour or a non-colour is no change', () => {
    expect(groupColourChange(palette(), 'Group1', 'Control', '#aa3300')).toEqual({ context: 'Group1', colors: { Control: '#AA3300' } });
    expect(groupColourChange(palette(), 'Group1', 'Control', '#377eb8')).toBeNull();
    expect(groupColourChange(palette(), 'Group1', 'Control', 'red')).toBeNull();
    expect(groupColourChange(palette(), 'Group1', 'Nobody', '#aa3300')).toBeNull();
  });
  it('a palette choice is Use palette for any listed palette', () => {
    expect(paletteChoiceChange(palette(), 'Tableau Classic')).toEqual({ palette: 'Tableau Classic' });
    expect(paletteChoiceChange(palette(), 'Not listed')).toBeNull();
  });
  it('only a well-formed state is restored; equal states compare equal whatever the key order or case', () => {
    expect(validatePaletteState({ useCustomColors: true, customColors: { 'Group1::Control': '#aa3300' }, activePalette: 'Default' }))
      .toEqual({ useCustomColors: true, customColors: { 'Group1::Control': '#AA3300' }, activePalette: 'Default' });
    expect(validatePaletteState({ useCustomColors: 'yes', customColors: {}, activePalette: 'Default' })).toBeUndefined();
    expect(validatePaletteState({ useCustomColors: true, customColors: { x: 'red' }, activePalette: 'Default' })).toBeUndefined();
    expect(samePalette({ useCustomColors: true, customColors: { b: '#aa0000', a: '#BB0000' }, activePalette: 'P' },
      { activePalette: 'P', customColors: { a: '#bb0000', b: '#AA0000' }, useCustomColors: true })).toBe(true);
  });
});
describe('one undo step per change', () => {
  it('undo puts the earlier state in the document, redo the later one', () => {
    const store = createStore<WithPalette>({ nodes: [] }), history = createHistory(store);
    const s0 = { useCustomColors: false, customColors: {}, activePalette: 'Default' };
    const s1 = { useCustomColors: true, customColors: { 'Group1::Control': '#AA3300' }, activePalette: 'Default' };
    const s2 = { useCustomColors: true, customColors: { 'Group1::Control': '#0055AA' }, activePalette: 'Default' };
    history.dispatch(setSessionPalette(s1, s0)); history.dispatch(setSessionPalette(s2, s1));
    expect(store.get().sessionPalette).toEqual(s2);
    history.undo(); expect(store.get().sessionPalette).toEqual(s1);
    history.undo(); expect(store.get().sessionPalette).toEqual(s0);
    expect(history.canUndo).toBe(false);
    history.redo(); expect(store.get().sessionPalette).toEqual(s1);
  });
});
describe('mock: session-wide, as Team', () => {
  it('a group colour, a preset and a restore change the session for every card', () => {
    const id = 'palette-test-session';
    const before = mockPaletteGet(id).state;
    expect(mockPalettePut(id, { context: 'Group1', colors: { Control: '#aa3300' } }).state.customColors['Group1::Control']).toBe('#AA3300');
    expect(mockPaletteColour(id, 'Control')).toBe('#AA3300');
    expect(mockPaletteColour(id, 'Case')).toBe('#E41A1C');
    expect(mockPalettePut(id, { palette: 'Tableau Classic' }).active).toBe('Tableau Classic');
    expect(mockPaletteColour(id, 'Case')).toBe('#4E79A7');
    mockPalettePut(id, { restore: before });
    expect(mockPaletteColour(id, 'Control')).toBe('#377EB8');
    expect(() => mockPalettePut(id, { palette: 'nope' })).toThrow(/Unknown palette/);
    expect(() => mockPalettePut(id, { context: 'Group1', colors: { Nobody: '#123456' } })).toThrow(/Unknown group/);
  });
});
// Steph review 7c: two groups of one grouping hard to tell apart get an inline warning naming both; the change is not
// blocked (the pickers stay enabled). The live API's GET /palette shape, and the mock's, render the same way.
describe('near-identical group colours', () => {
  const live = (control: string): SessionPalette => ({ active: 'Default', shapesEditable: false,
    state: { useCustomColors: true, customColors: { 'Group1::Control': control, 'Group1::Treatment': '#377EB8' }, activePalette: 'Default' },
    palettes: [{ name: 'Default', kind: 'default', colors: [] }],
    contexts: [{ id: 'Group1', label: 'Sample groups (Group 1)', groups: [{ name: 'Control', color: control }, { name: 'Treatment', color: '#377EB8' }] }] });
  const view = (value: SessionPalette) => renderToStaticMarkup(<PaletteView palette={value} busy={false} onPalette={() => {}} onColour={() => {}}/>);
  it('live: Control #0055AA beside Treatment #377EB8 warns, naming both, and the pickers stay enabled', () => {
    const html = view(live('#0055AA'));
    expect(html).toContain('Control and Treatment are hard to tell apart');
    expect(html).toMatch(/class="session-palette-warning"[^>]*role="status"|role="status"[^>]*class="session-palette-warning"/);
    expect(html).not.toContain('disabled');
  });
  it('live: #AA3300 beside Treatment does not warn', () => { expect(view(live('#AA3300'))).not.toContain('hard to tell apart'); });
  it('mock: the same choice through the mock session palette warns', () => {
    const id = 'palette-contrast-session';
    expect(view(mockPaletteGet(id))).not.toContain('hard to tell apart');
    const next = mockPalettePut(id, { context: 'Group1', colors: { Case: '#0055aa', Control: '#377EB8' } });
    expect(view(next)).toContain('Case and Control are hard to tell apart');
  });
});
