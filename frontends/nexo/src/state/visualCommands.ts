import type {Command} from './commands';
import type {Node,Visual} from './document';
import {serializeEditor} from '../editor/editorState';
export type AppearancePatch = {label?:string;color?:string|null;visual?:Partial<Visual>};
export function setAppearance(id:string,patch:AppearancePatch,replace=false):Command {
 const copy=structuredClone(patch);
 if(copy.visual?.editor)copy.visual.editor=serializeEditor(copy.visual.editor);
 // Undo replays the old fields; a field the node never had is removed again, not left as an undefined key.
 return {kind:'setAppearance',apply(doc){return {...doc,nodes:doc.nodes.map(raw=>{const n=raw as Node;if(n.id!==id)return n;const next={...n,...copy,visual:replace?copy.visual:{...n.visual,...copy.visual}} as Node;for(const k of ['label','color','visual'] as const)if(next[k]===undefined)delete next[k];return next;})};},invert(doc){const n=doc.nodes.find(n=>n.id===id) as Node;return setAppearance(id,{label:n.label,color:n.color,visual:n.visual},true);}};
}
