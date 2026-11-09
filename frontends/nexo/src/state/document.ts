// Canvas v1 JSON shapes from R/frontends/team/canvas_state.R. Numeric ranges,
// string patterns, ownership and cross-field constraints still require validation.
export const LIMITS = {
  nodes: 40, // canvas_state.R:2
  stateBytes: 24 * 1024 ** 2, // canvas_state.R:2,623 (UTF-8 bytes)
  snapshotBytes: 4 * 1024 ** 2, // canvas_state.R:2,201 (not JS URL.length)
  width: { min: 240, max: 4000 }, // canvas_state.R:604
  height: { min: 220, max: 4000 }, // canvas_state.R:605
  x: { min: 0, max: 1e6 }, // canvas_state.R:603
  y: { min: 0, max: 1e6 }, // canvas_state.R:604
  fontSize: { min: 8, max: 48 }, // canvas_state.R:572
  label: 512, // canvas_state.R:603; characters, not UTF-16 units (21–25)
  tabs: 20, // canvas_state.R:396
  tabName: 40, // canvas_state.R:413
  documentItems: 80, // canvas_state.R:355
} as const;

export interface CanvasState { version: '1'; libraryHidden: boolean; nodes: Node[]; document?: Document | null; tabs?: Tabs | null }
export interface Node {
  kind: 'plot' | 'illustration'; id: string; label: string;
  x: number; y: number; width: number; height: number; visual: Visual;
  finished?: Finished | null; assetId?: string | null; assetVersion?: '1' | null; color?: string | null;
  insight?: Insight | null; instance?: Instance | null; statistics?: Statistics | null;
}
export interface Visual {
  plotTitle?: string; xTitle?: string; yTitle?: string; fontSize?: number;
  fontColor?: string; markColor?: string; background?: string;
  editor?: Editor; groupComparison?: GroupComparison;
}
export type Scalar = string | number | boolean;
export interface Finished { url: string; createdAt: string; stale: boolean; provenance?: Record<string, Scalar | null> | null }
// Input allowlist and bounds are in R/frontends/team/plot_instances.R:503–529.
export interface Instance { id: string; source: string; inputs: Record<string, Scalar | Scalar[] | null> }
export interface Insight {
  paragraph: string; context_label: string; searched_at: string; fingerprint: string; stale: boolean;
  sources: { pmid: string; title: string; year: string; url: string }[];
}
type Axis = 'xaxis' | 'yaxis';
type FontFamily = 'Arial' | 'Helvetica' | 'Verdana' | 'Georgia' | 'Times New Roman' | 'Courier New' | 'system-ui' | 'sans-serif';
// Layout keys are dotted JSON keys, not nested Plotly layout objects (R:257–270).
export type EditorLayout = Partial<
  Record<'title.text' | `${Axis}.title.text` | 'paper_bgcolor' | 'plot_bgcolor' | 'font.color' | 'title.font.color' | 'legend.font.color' | 'legend.bgcolor' | `${Axis}.${'color' | 'gridcolor' | 'zerolinecolor'}`, string> &
  Record<'font.size' | 'title.font.size' | 'legend.font.size' | `${Axis}.${'title.font.size' | 'tickfont.size' | 'gridwidth' | 'zerolinewidth' | 'linewidth' | 'tickangle'}` | 'title.x' | 'title.y' | 'legend.x' | 'legend.y', number> &
  Record<'showlegend' | `${Axis}.${'showgrid' | 'zeroline' | 'showline' | 'showticklabels'}`, boolean> &
  Record<'font.family' | 'title.font.family' | 'legend.font.family', FontFamily> &
  Record<'title.xanchor' | 'legend.xanchor', 'left' | 'center' | 'right' | 'auto'> &
  Record<'title.yanchor' | 'legend.yanchor', 'top' | 'middle' | 'bottom' | 'auto'> &
  { 'legend.orientation': 'h' | 'v' }
>;
export type EditorTrace = {
  index: number; sourceKey?: string; name?: string; hidden?: boolean; points?: boolean; innerBox?: boolean;
  color?: string; fillColor?: string; fillOpacity?: number; lineColor?: string; lineWidth?: number; markerSize?: number; opacity?: number;
} & ({ scaleLow: string; scaleMid: string; scaleHigh: string } | { scaleLow?: never; scaleMid?: never; scaleHigh?: never });
export interface Editor {
  layout?: EditorLayout | null; traces?: EditorTrace[] | null;
  annotations?: { text: string; x: number; y: number; xref: 'paper'; yref: 'paper'; showarrow: false; font: { size: number; color: string } }[] | null;
  categoryLabels?: { axis: Axis; sourceKeys: string[]; values: string[]; labels: string[] }[] | null;
  swapAxes?: boolean | null; greyHealthy?: boolean | null;
  palette?: 'Pastel' | 'Gelato Days' | 'Lab' | 'Okabe–Ito' | 'Nature (NPG)' | 'Viridis' | null;
}
export interface GroupComparison {
  features: string[]; hiddenConditions: string[]; panelOff: Record<string, string[]>;
  panelStyles: Record<string, { colors: Record<string, string>; points: boolean; box: boolean; lines?: Record<string, string> | null }>;
}
export type Comparison = [string, string];
export type StatisticsApplied = {
  correction: 'holm' | 'BH' | 'bonferroni' | 'none'; scope: 'displayed' | 'all_in_scope'; comparisons: Comparison[];
} & ({ test: 'welch'; effect: 'none' | 'hedges_g' } | { test: 'wilcoxon'; effect: 'none' | 'cliffs_delta' });
export interface Statistics {
  version: '1';
  presentation: { show: boolean; pValue: 'adjusted' | 'raw'; label: 'exact' | 'stars' | 'both'; fontSize: number; spacing: number; tip: number; nDisplay: 'samples' | 'participants' | 'both' | 'hidden'; hidden: Comparison[] };
  applied?: StatisticsApplied | null; result?: StatisticsResult | null;
}
export interface StatisticsResult {
  fingerprint: string; dataFingerprint: string; computedAt: string; lipid: string; grouping: 'Group1' | 'Group2';
  family: { m: number; features: number; comparisons: number; untestable: number };
  groups: { group: string; nSamples: number; nExcluded: number; nParticipants?: number | null }[];
  rows: { a: string; b: string; nA: number; nB: number; statistic?: number | null; df?: number | null; p?: number | null; pAdj?: number | null; effect?: number | null; note: string }[];
  provenance: { method: string; transformation: string; normalization: string; imputation: string; participantIds: 'unique' | 'absent'; design: string };
}
interface ItemBox { id: string; x: number; y: number; width: number; height: number; z: number }
export type DocumentItem = ItemBox & (
  { type: 'figure'; nodeId: string; caption: string } |
  { type: 'text'; text: string; fontSize: number; color: string } |
  ({ type: 'shape'; fill: string; stroke: string; strokeWidth: number } & (
    { shape: 'rectangle' | 'ellipse'; radius?: number | null } | { shape: 'line' | 'arrow'; radius?: null }
  ))
);
export type Document = {
  version: '1'; layout: 'free' | 'pages' | 'arrangement' | 'figure1'; orientation: 'portrait' | 'landscape';
  showPageFurniture?: boolean | null; items: DocumentItem[];
} & ({ paper: 'custom'; paperWidth: number; paperHeight: number } | { paper: 'letter' | 'a4'; paperWidth?: null; paperHeight?: null });
export interface Tab { id: string; name: string; nodes: string[] }
export interface Tabs { version: '1'; tabs: Tab[]; active: string; figure?: { deselected: string[]; order: string[] } }
