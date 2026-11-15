import type { CatalogEntry, Design, Node } from '../api/types';
export function needsStudyDesign(node: Node, catalog: CatalogEntry[], design?: Design) { return node.kind === 'plot' && !design?.allowed && catalog.some(entry => entry.needs === 'de' && (entry.id === node.instance?.source || entry.id === node.id || node.id.endsWith(`-${entry.output}`))); }
export function enlargedHeatmap(node: Node) { return { width: Math.max(1000, node.width), height: Math.max(1100, node.height) }; }
