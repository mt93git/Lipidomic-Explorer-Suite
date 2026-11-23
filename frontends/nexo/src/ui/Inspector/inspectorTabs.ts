// Which Inspector tabs a card has (approved layout 2026-11-23): Data · Style · Stats · Export, where Stats appears only
// on a card that has statistics. The old tab names (Appearance, Statistics) still select the new tabs.
import type { Node } from '../../api';
import { hasPcaScore } from './PcaScoreSection';
export type InspectorTab = 'Data' | 'Style' | 'Stats' | 'Export';
const OLD_NAMES: Record<string, InspectorTab> = { Appearance: 'Style', Statistics: 'Stats' };
/** The tab an event or a link names, in the current names. */
export const normaliseTab = (name: string): string => OLD_NAMES[name] ?? name;
const LEGACY = /^results_dashboard-plot_(pca|violin|dist|comp|heat)$/;
/** The module output a card draws; legacy dashboard nodes carry it as their id. */
export const statsSource = (node: Pick<Node, 'id' | 'instance'>): string | undefined => node.instance?.source ?? (LEGACY.test(node.id) ? node.id : undefined);
/** PCA and PCA score, group comparison and independent violin copies have a Stats tab. */
export function hasStatistics(node: Pick<Node, 'id' | 'instance'>): boolean {
  const source = statsSource(node);
  return hasPcaScore(source) || !!source?.includes('group_comparison') || source === 'results_dashboard-plot_violin';
}
export function tabsFor(node: Pick<Node, 'id' | 'instance' | 'kind' | 'finished'>): InspectorTab[] {
  if (node.kind === 'illustration') return ['Style', 'Export'];
  if (node.finished) return ['Export'];
  return hasStatistics(node) ? ['Data', 'Style', 'Stats', 'Export'] : ['Data', 'Style', 'Export'];
}
export type PillState = 'ok' | 'updating' | 'pending' | 'waiting' | 'error' | 'finished' | 'stale';
/** The status pill's colour, from the status text the header shows (`need`: the text is what the card still needs). */
export function pillState(text: string, need = false): PillState {
  if (need) return 'waiting';
  if (text === 'Up to date') return 'ok';
  if (text === 'Updating…' || text === 'Finishing…') return 'updating';
  if (text === 'Changes pending') return 'pending';
  if (text === 'Needs data' || text === 'Needs settings' || text.startsWith('Waiting')) return 'waiting';
  if (text === 'Finished') return 'finished';
  if (text.startsWith('Finished')) return 'stale';
  return 'error';
}
