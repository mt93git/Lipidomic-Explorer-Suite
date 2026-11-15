import type { Node } from '../api/types';
import type { CanvasState, Document } from './document';
import { validateState } from './validate';
import { serialize, validate, type TabState } from './tabs';
export function toCanvasV1(doc: {nodes: readonly Node[]; libraryHidden?: boolean; document?: Document | null}, tabs: TabState): CanvasState {
 const nodes=structuredClone(doc.nodes).map(n=>({...n,visual:n.visual ?? {},finished:n.finished ?? null,...(n.instance ? {instance:{id:n.instance.id ?? n.instance.instanceId,source:n.instance.source,inputs:n.instance.inputs ?? {}}}: {})}));
 // The figure page belongs to the saved canvas (team-canvas-v1.json): never drop it.
 const state={version:'1' as const,libraryHidden:doc.libraryHidden ?? false,nodes,document:doc.document ? structuredClone(doc.document) : null,tabs:serialize(tabs,nodes.map(n=>n.id))};
 const checked=validateState(state); if(!checked.ok) throw Error(checked.message);
 // Validation checks limits; retain snapshot and input values verbatim.
 return state as CanvasState;
}
export function fromCanvasV1(state: unknown): {nodes: Node[]; libraryHidden: boolean; tabs: TabState; document: Document | null} {
 const checked=validateState(state);if(!checked.ok)throw Error(checked.message);
 const value=structuredClone(state) as CanvasState;
 return {nodes:value.nodes as Node[],libraryHidden:value.libraryHidden,tabs:validate(value.tabs,value.nodes.map(n=>n.id)),document:value.document ?? null};
}
