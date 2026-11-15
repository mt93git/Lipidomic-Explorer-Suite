import type * as Y from 'yjs';
import type { CanvasState } from '../state/document';
import { prune } from '../state/tabs';
import { fromDoc } from './schema';

/** Team v1 projection with explicit shared tabs and savedActive, without browser-dependent validation.
 * Admission and limits belong to the caller. In particular SVG remains verbatim.
 */
export function toTeamCanvasV1(doc: Y.Doc): CanvasState {
 const {state, tabs} = fromDoc(doc);
 const nodes = state.nodes.map(node => ({
  ...node, visual: node.visual ?? {}, finished: node.finished ?? null,
  ...(node.instance ? {instance:{id:node.instance.id, source:node.instance.source, inputs:node.instance.inputs ?? {}}} : {}),
 }));
 return {version:'1', libraryHidden:state.libraryHidden ?? false, nodes,
  document:state.document ?? null, tabs:Object.assign(prune(tabs, nodes.map(node => node.id)), {savedActive:tabs.active})};
}

export function toNexoV1(doc: Y.Doc) {
 return fromDoc(doc).nexo;
}
