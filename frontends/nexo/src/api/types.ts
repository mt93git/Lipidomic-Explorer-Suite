export type RenderKind = 'plotly' | 'png' | 'visnetwork' | 'html';
export type Inputs = Record<string, unknown>;
export interface Design { allowed: boolean; unit: string | null; type: string | null; confirmed: boolean; timePointsReady?: boolean }
export interface CatalogEntry { id: string; family: string; output: string; render: RenderKind; needs: 'de' | 'time' | null; allowedInputs: string[]; inputs?: SchemaControl[]; defaults: Inputs; tabs: Inputs; shownBy: Inputs; defaultSize: {width:number; height:number}; /** The input holding the module's own plot height (catalog.R heightInput). */ heightInput?: string; /** Chart audit b12: the Plotly event source whose clicks Team observes (catalog.R clickSource; plotlyClick.ts). */ clickSource?: string; label: string; group: string; description: string }
export interface Catalog { version: string | number; outputs: CatalogEntry[] }
export interface CardResult { instanceId: string; nodeId: string; source: string; family: string; render: RenderKind; allowedInputs: string[]; inputs: Inputs; settled: boolean; error: unknown; /** The module's plot height (heightInput's settled value). */ plotHeight?: number }
export interface CardUpdate { settled: boolean; inputs: Inputs; plotHeight?: number; /** A dialog the module opened (showModal) on this update; html is unsanitised. */ modal?: { title: string; html: string } }
export type CardRender = ({figure: unknown; provenance?: unknown; render?: RenderKind} | {blob: Blob; revision: string | null}) & {/** Collab mode: X-Nexo-Engine-Revision. */ engineRevision?: number};
export interface ApiError { error: string; message: string }

export interface Node { statistics?: import('../state/document').Statistics | null; kind: 'plot' | 'illustration'; id: string; label: string; x: number; y: number; width: number; height: number; visual?: { plotTitle?: string }; finished?: { url: string; createdAt?: string; stale?: boolean; provenance?: unknown } | null; assetId?: string; assetVersion?: string; color?: string; instance?: { id?: string; instanceId?: string; source: string; inputs?: Inputs } }
export interface Session { workspace?: string; /** Dataset opens: the workspace of a shared project of this open. */ projectWorkspace?: string; /** Render worker processes beside the main one (absent on older servers: none). */ renderWorkers?: number; nexo?: import('../state/nexo').Nexo | null; near_limit?: boolean; design?: Design; deState?: unknown; sessionId: string; checkpointSha256?: string; preparationCheck?: string; samples: unknown; lipids: unknown; preparation: unknown; inputs: Record<string, unknown>; canvas: { nexo?: import('../state/nexo').Nexo; nodes: Node[]; version?: string; libraryHidden?: boolean; tabs?: unknown } }
export interface Figure { data: unknown[]; layout: Record<string, unknown> }
export interface PlotResult { figure: Figure; provenance: unknown }

export interface AnalysisSettings { sections: {title: string; controls: SchemaControl[]}[]; design: Design; deState: unknown }
export interface SchemaControl {
  section?: string; condition?: string | null;
  /** Team selectize metadata; drag_drop means selection order is significant. */
  plugins?: string[]; selectize?: { plugins?: string[] };
  id: string; type: 'select'|'multiselect'|'number'|'range'|'boolean'|'checkboxgroup'|'checkboxGroup'|'radio'|'text'|'textarea'|'color'|'tabs'|'action'|'bucket';
  label: string; default?: unknown; value?: unknown; options?: {value: string; label: string; class?: string}[];
  min?: number; max?: number; step?: number; multiple?: boolean; group?: string;
  /** The title Team shows for the control's tab when `group` is its raw value ("differential_view"). */
  groupLabel?: string;
  /** Team dashboard selection bars (text wire value with choices): the defaults behind `__ALL__` and the token written for "every choice". */
  defaultChoices?: string[] | null; allToken?: '__ALL__' | '__EVERY__';
  /** A control Team's module computes at run time (customCol_/customShape_/bqcSamples): kept in Nexo's member. */
  computed?: boolean;
  /** Team keeps this value in a hidden input (a state carrier, never shown in Team): sent and saved, not drawn. */
  hidden?: boolean;
  /** Team's own status note for this control, read from the module's rendered output (schema.R api_control_status):
   * whether the gated option is available, Team's text, and which option it gates. */
  status?: ControlStatus;
}
export interface ControlStatus { allowed: boolean; text: string | null; option?: string | null }
/** A module button (Team's live module UI): its visible label and the tab it sits in. */
export interface ActionControl { id: string; label: string; tab?: string | null }
/** b11 F3: a module configuration file input (export.R api_card_upload_controls), e.g. the pathway layout JSON. */
export interface UploadControl { id: string; label: string; accept: string }
export interface CardUpload { settled: boolean; inputs: Record<string, unknown>; file: {name: string; size: number} }
export interface CardSchema { controls: SchemaControl[]; actions: string[]; actionControls?: ActionControl[]; tabs: Record<string, unknown>; uploads?: UploadControl[];
  /** Pilot F1: this card's group colours follow Team's session palette (frontends/nexo-api/palette.R). */
  sessionPalette?: boolean }

export interface Checkpoint { near_limit?: boolean; id:string; name:string; sizeBytes:number; sha256:string; createdAt:string; source: 'store'|'folder' }

export interface ViolinPolicy { allowed:boolean; reason?:string }
export interface ViolinRequest { mode:'describe'|'apply'|'verify'|'check'; settings?:import('../statistics/settings').Settings; dataFingerprint?:string }
export interface ViolinReply {
 dataFingerprint?:string; requestId:string; instanceId:string; mode:ViolinRequest['mode']; status:'ok'|'blocked'|'invalidated'|'unchanged'|'error';
 describe?:{groups:import('../state/document').StatisticsResult['groups']; normalization?:string; imputation?:string; participantIds?:string; [key:string]:unknown};
 settings?:import('../statistics/settings').Settings; result?:import('../state/document').StatisticsResult; reason?:string; policy:ViolinPolicy;
}
export interface GroupComparisonReply {requiresConfirmation?:boolean; confirmationToken?:string; [key:string]:unknown}
export type { ExportPresets, ExportRequest } from '../export/presets';
export interface FileDownload { blob: Blob; filename: string }
// A module download button that sits with the plot (Team's "More downloads from this analysis").
export interface CardDownload { id: string; label: string }

/** One choice Team's preparation still needs (POST /datasets/sessions → 422 preparation_choices_required). */
export interface PreparationChoice { name: string; label: string; kind: 'samples' | 'number' | 'choice' | 'boolean' | string; choices?: string[]; min?: number; max?: number; step?: number; teamControlDefault: unknown }
export interface PreparationChoices { error: string; reason: 'preparation_choices_required'; message: string; missing: PreparationChoice[]; availableSamples: string[];
  /** Each sample's condition group from the Metadata sheet (nexo-entry-build.md C3); absent without one. */ sampleGroups?: Record<string, string>;
  /** A released dataset's order code and version (Prepare's title); absent for an upload. */ orderCode?: string; version?: number }
/** A decision on a sample the quality check flagged (C3): it travels in the project's settings as outlierDecisions. */
export interface OutlierDecision { sample: string; choice: 'keep' | 'exclude' | 'undecided'; reason?: string; by?: string }
/** POST /datasets/preview (C3): the samples and detection settings Team's detection rule needs. */
export interface DatasetPreviewRequest { adminDatasetId: string; samples: string[]; minDetectionPct: unknown; detectionScope: unknown; dropNonDetected: unknown }
/** Team's detection counts for those settings, without opening a session. */
export interface DatasetPreview { kept: number; total: number; leftOut: string[]; histogram: { detectedIn: number; kept: number; leftOut: number }[]; samples: number; missing: { values: number; cells: number } }
/** The explicit preparation settings sent back: the selected samples plus every required setting, as received. */
export type DatasetSettings = { samples: string[] } & Record<string, unknown>;
/** A session prepared from a released Admin dataset: a checkpoint session plus where it came from. */
export interface DatasetSession extends Session { dataset: { sha256?: string; format?: number; settings?: DatasetSettings; adminDatasetId: string; orderCode: string; version: number } }
export type DatasetOpen = { status: 'choices'; choices: PreparationChoices } | { status: 'ready'; session: DatasetSession };
