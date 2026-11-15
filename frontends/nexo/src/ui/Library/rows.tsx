import type { CatalogEntry, Design } from '../../api';
import { availability, availabilityReasons } from '../../catalog';

// Request status belongs to the React library, not the API catalog schema.
export type LibraryEntry = CatalogEntry & { status?: 'queued' | 'ready' };
export function rowState(entry: LibraryEntry, design: Design | undefined, countOnCanvas: number): {
  state: 'Add' | 'Added' | 'Queued' | 'Ready' | 'Requires configuration' | 'Unavailable'; reason: string;
} {
  if (countOnCanvas > 0) return { state: 'Added', reason: '' };
  const available = availability(entry, design);
  if (available !== 'add') return {
    state: available === 'needs-design' ? 'Requires configuration' : 'Unavailable',
    reason: availabilityReasons[available]
  };
  if (entry.status) return { state: entry.status === 'queued' ? 'Queued' : 'Ready', reason: '' };
  return { state: 'Add', reason: 'The plot is not visible yet. Add it to the canvas to check whether its analysis has produced a figure.' };
}
export function filterCatalog(outputs: CatalogEntry[], query: string, family = 'All'): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return outputs.filter(entry => (family === 'All' || entry.group === family || family === 'Differential' && entry.group === 'Differential analysis') &&
    `${entry.label} ${entry.description} ${entry.group}`.toLowerCase().includes(needle));
}
