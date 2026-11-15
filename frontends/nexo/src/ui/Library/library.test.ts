import { describe, expect, it } from 'vitest';
import catalog from '../../mock/catalog.json';
import type { CatalogEntry, Design } from '../../api';
import { filterCatalog, rowState } from './rows';

const entry = catalog.outputs[0] as CatalogEntry;
const design: Design = { allowed: true, confirmed: true, unit: 'Animal', type: 'independent' };
describe('library rows', () => {
  it('offers Add before a plot is checked', () => {
    expect(rowState(entry, design, 0)).toEqual({ state: 'Add', reason: 'The plot is not visible yet. Add it to the canvas to check whether its analysis has produced a figure.' });
  });
  it('reports Added for one or multiple canvas copies', () => {
    for (const count of [1, 3]) expect(rowState(entry, design, count)).toEqual({ state: 'Added', reason: '' });
  });
  it('supports local Queued and Ready status without changing catalog data', () => {
    expect(rowState({ ...entry, status: 'queued' }, design, 0)).toEqual({ state: 'Queued', reason: '' });
    expect(rowState({ ...entry, status: 'ready' }, design, 0)).toEqual({ state: 'Ready', reason: '' });
  });
  it('requires confirmation for differential plots, including absent design', () => {
    for (const value of [undefined, { ...design, allowed: false, confirmed: false }]) {
      expect(rowState({ ...entry, needs: 'de' }, value, 0)).toEqual({ state: 'Requires configuration', reason: 'Needs a confirmed study design' });
    }
  });
  it('reports the exact paired-design reason, even with local ready status', () => {
    expect(rowState({ ...entry, needs: 'de', status: 'ready' }, { ...design, allowed: false, type: 'paired' }, 0)).toEqual({ state: 'Unavailable', reason: 'Not available for a paired design' });
  });
  it('reports the exact time-point reason and enables ready metadata', () => {
    expect(rowState({ ...entry, needs: 'time' }, design, 0)).toEqual({ state: 'Unavailable', reason: 'Time courses need at least two TimePoint values in the sample metadata. Without them nothing can be drawn; with them, check the time-course settings in Data & settings.' });
    expect(rowState({ ...entry, needs: 'time' }, { ...design, timePointsReady: true }, 0).state).toBe('Add');
  });
  it('keeps existing copies visible as Added after design changes', () => {
    expect(rowState({ ...entry, needs: 'de' }, undefined, 2).state).toBe('Added');
  });
});
describe('catalog search', () => {
  const outputs = [{ ...entry, label: 'PCA view', description: 'Sample projection', group: 'Dashboard' }, { ...entry, id: 'other', label: 'Heatmap', description: 'Lipid abundance', group: 'Heatmaps' }];
  it('matches title, description and group case-insensitively', () => {
    for (const query of ['pCa', ' PROJECTION ', 'dashBOARD']) expect(filterCatalog(outputs, query)).toEqual([outputs[0]]);
    expect(filterCatalog(outputs, 'LIPID')).toEqual([outputs[1]]);
  });
  it('handles empty queries and misses without mutating the catalog', () => {
    expect(filterCatalog(outputs, '  ')).toEqual(outputs);
    expect(filterCatalog(outputs, 'absent')).toEqual([]);
    expect(outputs).toHaveLength(2);
  });
  it('filters by family, intersects search and resets with All', () => {
    expect(filterCatalog(outputs, '', 'Heatmaps')).toEqual([outputs[1]]);
    expect(filterCatalog(outputs, 'pca', 'Heatmaps')).toEqual([]);
    expect(filterCatalog(outputs, 'lipid', 'Heatmaps')).toEqual([outputs[1]]);
    expect(filterCatalog(outputs, '', 'All')).toEqual(outputs);
  });
  it('uses the displayed Differential family for the catalog alias', () => {
    const differential = { ...entry, group: 'Differential analysis' };
    expect(filterCatalog([differential], '', 'Differential')).toEqual([differential]);
  });
});
