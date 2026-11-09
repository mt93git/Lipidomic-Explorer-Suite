// Chart audit b07 F3: module buttons the user pressed on a Team card (e.g. structural "Initiate Structural Analysis").
// Team's canvas saves only a card's inputs, so Nexo keeps the pressed action ids, in order, in its own member
// (NexoNode.actions; never the instance inputs) and asks the API to replay them on a copy, after a reopen and after
// a session recovery (POST .../cards/<id>/replay, R/frontends/api/cards.R api_card_replay). Download buttons are
// never recorded; at most 20 ids are kept.
import type {Command} from './commands';
import {setNexoActions, type Nexo} from './nexo';
import type {Node} from '../api/types';
export const MAX_RECORDED_ACTIONS=20;
const actionId=/^[A-Za-z][A-Za-z0-9_]{0,99}$/;
export const isReplayable=(id:unknown):id is string=>typeof id==='string'&&actionId.test(id)&&!/download/i.test(id);
/** The recorded list as stored: replayable ids, first press order, no repeats, bounded. */
export function recordedActions(value:unknown):string[] {
 if(!Array.isArray(value))return [];
 const out:string[]=[];for(const id of value)if(isReplayable(id)&&!out.includes(id)&&out.length<MAX_RECORDED_ACTIONS)out.push(id);
 return out;
}
/** A press appends the action once (a second press of the same button is already recorded). */
export function withPressed(list:readonly string[]|undefined,id:string):string[] {
 const current=recordedActions(list);return isReplayable(id)&&!current.includes(id)&&current.length<MAX_RECORDED_ACTIONS?[...current,id]:current;
}
export function recordAction(nodeId:string,id:string):Command {
 return {kind:'recordAction',apply(doc){const nexo=(doc as typeof doc&{nexo?:Nexo}).nexo;return setNexoActions(nodeId,withPressed(nexo?.nodes[nodeId]?.actions,id)).apply(doc);},
  invert(doc){return setNexoActions(nodeId,(doc as typeof doc&{nexo?:Nexo}).nexo?.nodes[nodeId]?.actions);}};
}
/** The replays to request after a session opens: one per Team card whose member records presses, in canvas order. */
export function actionReplays(nodes:readonly Node[],nexo:Nexo|undefined):{nodeId:string;instanceId:string;actions:string[]}[] {
 return nodes.flatMap(n=>{const instanceId=n.instance?.instanceId??n.instance?.id;const actions=recordedActions(nexo?.nodes[n.id]?.actions);
  return n.kind==='plot'&&instanceId&&actions.length?[{nodeId:n.id,instanceId,actions}]:[];});
}
/** Cards whose replay failed: the Inspector says which buttons must be pressed again. Cleared by a successful press. */
const failures=new Map<string,string[]>(),listeners=new Set<(nodeId:string)=>void>();
export function onReplayFailures(fn:(nodeId:string)=>void):()=>void {listeners.add(fn);return ()=>{listeners.delete(fn);};}
export const replayFailures=(nodeId:string):string[]=>failures.get(nodeId)??[];
/** The Inspector's message: which buttons Nexo could not press again on this card. */
export function replayFailedMessage(labels:readonly string[]):string {
 const names=labels.map(l=>`"${l}"`).join(', ');
 return `Nexo could not press ${names} again on this card after it was copied or reopened: press ${labels.length>1?'them':'it'} again to draw the plot.`;
}
export function setReplayFailures(nodeId:string,failed:readonly string[]):void {
 const list=recordedActions(failed);if(list.length)failures.set(nodeId,list);else failures.delete(nodeId);
 listeners.forEach(fn=>fn(nodeId));
}
/** One replay: the API presses, in order, the recorded actions this instance has not had yet. */
export async function replayRecorded(nodeId:string,actions:readonly string[],replay:(actions:string[])=>Promise<{failed?:string[]}>,
 rethrow:(error:unknown)=>boolean=error=>(error as {name?:string})?.name==='SessionLostError'):Promise<string[]> {
 const list=recordedActions(actions);if(!list.length)return [];
 let failed:string[];
 try{failed=recordedActions((await replay(list)).failed);}catch(error){if(rethrow(error))throw error;failed=list;}
 setReplayFailures(nodeId,failed);return failed;
}
