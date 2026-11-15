import {validateState as validateFigureState} from '../state/validate';
import { createContext } from 'react';
import type { Session } from '../api';

export interface CanvasHandle {
  enterFigureMode():void;
  exitFigureMode():void;
  readonly figureMode:boolean;
  figureLayer():HTMLElement;
  snapshotState?: () => import("../state/document").CanvasState;
  figureOf(id:string): import('../editor/applyEditor').Figure | undefined;
  setStatistics(id:string, statistics:import('../state/document').Statistics|null):void;
  setNexoStyle(id:string,style:import('../state/nexo').NexoStyle):void;
  nexoStyle(id:string):import('../state/nexo').NexoStyle;
  /** Data inputs of a fixed dashboard card, kept in Nexo's member. */
  nexoInputs(id:string):Record<string,unknown>|undefined;
  /** A committed computed-control change (already PATCHed): one undo step in Nexo's member; redraws the card. */
  setComputedInputs?(id:string,patch:Record<string,unknown>,baseline:Record<string,unknown>):void;
  /** Pilot F1: a session palette change already PATCHed: one undo step; undo/redo send the earlier state back. */
  setSessionPalette?(before:import('../palette/sessionPalette').PaletteState,after:import('../palette/sessionPalette').PaletteState):void;
  /** Steph review rows 2/12: keep the confirmed design in Nexo's member (not an undo step; saved with the checkpoint). */
  saveDesign?(design:import('../state/nexo').SavedDesign):void;
  /** The design this checkpoint was saved with, if any. */
  savedDesign?():import('../state/nexo').SavedDesign|undefined;
  /** Steph review 4b: each unfinished plot card's drawing, to tell which cards a session palette change redrew. */
  drawProbes?():import('../palette/paletteRedraw').DrawProbe[];
  /** Chart audit b07 F3: a module button pressed on the card, recorded (in order) in Nexo's member for replay. */
  recordAction?(id:string,action:string):void;
  /** The module buttons recorded for a card (Nexo's member), in press order. */
  nexoActions?(id:string):string[];
  /** b11 F3: the module took an uploaded configuration file: the instance inputs it set (Team saves them) and the file
   * itself in Nexo's member, one undo step; redraws the card. */
  recordUpload?(id:string,inputId:string,file:{name:string;content:string},inputs:Record<string,unknown>):void;
  showAsTeam(id:string,show:boolean):void;
  isTeamView(id:string):boolean;
  setVisual(id:string, patch:Partial<import('../state/document').Visual>):void;
  setAppearance(id:string, patch:import('../state/visualCommands').AppearancePatch):void;
  /** Style batch (Match fonts, Paste style, Apply to tab): one undo step, size changes settle neighbours. */
  styleNodes(kind:string, entries:import('../state/commands').StyleEntry[]):void;
  /** F4 Copy style from a Plotly card (false for image cards: nothing to copy but size). */
  copyStyle(id:string):boolean;
  /** F4 Paste style onto these cards; one undo step. Returns how many cards changed. */
  pasteStyle(ids:string[]):number;
  /** F5 the plan for Apply style to tab from this card; commit=true applies it as one undo step. */
  applyStyleToTab(id:string, commit:boolean):{full:number;sizeOnly:number;skipped:number;tab:string}|null;
  /** Card ids on the same canvas tab as this card (the card included). */
  tabNodeIds(id:string):string[];
  /** Exact card size in px (clamped as a drag resize), neighbours settled; one undo step. */
  setCardSize(id:string, size:{width:number;height:number}):void;
  /** Exact card X/Y in px (0-1e6), neighbours settled; one undo step. */
  setCardPosition(id:string, pos:{x:number;y:number}):void;
  addCard(source: string, signal?: AbortSignal, position?: { x: number; y: number }): Promise<void>;
  /** Team's "Plot on canvas" on a PCA card: a PCA score card with that card's settings (catalog.ts pcaScoreCard). */
  addPcaScore(nodeId: string): Promise<void>;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  tidy(): void;
  /** Align or distribute the selected cards (two or more; distribute needs three). One undo step. */
  arrange(kind: 'left' | 'right' | 'top' | 'bottom' | 'distributeX' | 'distributeY'): void;
  removeAll(): void;
  removeSelection(): void;
  duplicateSelection(): Promise<void>;
  duplicate(nodeId: string): Promise<void>;
  remove(nodeId: string): void;
  moveToTab(nodeId: string, tabId: string): void;
  copyToTab(nodeId: string, tabId: string): Promise<void>;
  /** Keep a plot card's source, inputs and visual for Paste plot. */
  copyPlot(nodeId: string): boolean;
  /** A new card from the plot clipboard, through the duplicate path. */
  paste(): Promise<void>;
  /** Zoom to 100 %. */
  resetZoom(): void;
  finishCard(nodeId: string): void;
  /** Runs a card action (duplicate, finish, copy, move, remove…) as the card's own menu does. */
  cardAction(nodeId: string, action: import('../cards').CardAction): void;
  editFigure(nodeId:string):void;
  addIllustration(assetId:string):void;
  setCardStatus(nodeId: string, status: import('../cards').CardStatus): void;
  /** What the card shows now (badge state, body message, run need): the Inspector status follows it (small fixes item 1). */
  cardShown?(nodeId: string): import('../inspectorStatus').CardShown | undefined;
  selection(): string[];
  currentNode(): import('../api').Node | undefined;
  updateCardInputs(nodeId: string, inputs: import('../api').Inputs): void;
  refreshCard(nodeId: string): void;
  fit(): void;
  /** Select a card, switch to its tab, bring it into view and highlight it. */
  focusNode(nodeId: string): boolean;
  /** Focus the next card made from this catalog source (cycles on repeated calls). */
  locateSource(source: string): boolean;
  zoomTo(scale: number): void;
  /** The live session, including cards added through this handle. */
  getSession(): Session;
  /** Fires after canvas draws (including additions and camera changes). */
  onChange(cb: () => void): () => void;
}
export const CanvasHandleContext = createContext<CanvasHandle | null>(null);

import type { Command } from '../state/commands';
import type { CanvasState } from '../state/types';
export type Camera = { x: number; y: number; scale: number };
export interface TabsBridge {
  dispatch(command: Command): void;
  document(): CanvasState & { tabs?: unknown };
  camera: Camera;
  refresh(): void;
  /** Fit the active tab's cards once they are on screen (first view of a tab); a tab with no cards is left as is. */
  fitWhenShown(): void;
}
// Kept outside the card renderer: shell actions share the engine's history.
export const tabsBridges = new WeakMap<CanvasHandle, TabsBridge>();

import { toCanvasV1 } from '../state/serialize';
import { validate as validateTabs } from '../state/tabs';
import { collab } from '../collab/mode';
/** Install after the canvas bridge exists; snapshots exclude camera and selection. */
export function checkpointHandle(handle: CanvasHandle) {
 return Object.assign(handle, {snapshotState() {
  const doc=tabsBridges.get(handle)!.document();
  const tabs=validateTabs(doc.tabs,doc.nodes.map(n=>n.id));
  // Phase 2 has no committed-change history: save the first tab, never a peer's personal view.
  if(collab()) tabs.active=tabs.tabs[0].id;
  const state=toCanvasV1(doc as {nodes: import('../api').Node[];libraryHidden?:boolean;document?:import('../state/document').Document|null},tabs);
  if(collab()) state.tabs=Object.assign(tabs,{savedActive:tabs.active});
  state.document=(doc as typeof doc & {document?:import("../state/document").Document}).document??null;
  const checked=validateFigureState(state);if(!checked.ok)throw Error(checked.message);return state;
 }});
}
