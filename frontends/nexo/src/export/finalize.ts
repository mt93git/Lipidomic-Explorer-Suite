import type {Scalar} from '../state/document';
export const messages = {
 tooLarge:'This figure is too large to finish and save. The live plot remains editable; reduce its size or use its existing download controls.',
 updating:'Wait for preparation and this plot to finish updating before finishing the figure.',
 statistics:'Wait for the violin statistics to finish before finishing the plot.',
 changed:'The analysis changed while preparing the figure. Wait for the current plot and try again.',
 statisticsChanged:'The violin statistics changed while finishing. Try again.',
 tooSmall:'The plot frame is too small to finish a readable figure. Enlarge the card, wait for the plot to redraw, and try again.',
 zoom:'This plot was drawn at the reduced canvas zoom, so its image is too small to finish. Zoom in to 100% and Finish again.',
 restore:'The live plot could not be returned to its previous layout, so the figure was not finished. Try again.',
 notReady:'Plot is not ready.',
 invalidAppearance:'Check the invalid appearance value before finishing the plot.',
 groupConfirm:'Confirm the Group comparison settings and wait for the current result before finishing.',
 groupReady:'Group comparison export is not ready. Try again.',
 groupChanged:'The Group comparison changed while finishing. Try again.',
 failed:'Could not finish the plot.'
} as const;
export function snapshotFits(url:unknown):url is string {return typeof url==='string' && url.length<=4*1024*1024;}
export function provenance({preparationRevision,statistics}: {preparationRevision:Scalar|null;statistics?:Record<string,Scalar|null>|null}) {return {preparationRevision,captureVersion:2,...statistics};}
export function isStale(node:{kind:string;finished?:{stale?:boolean;provenance?:unknown}|null},revision:unknown):boolean {
 if(node.kind==='illustration'||!node.finished)return false;
 const p=node.finished.provenance as {preparationRevision?:unknown}|undefined;
 return !!node.finished.stale || (p?.preparationRevision!=null && p.preparationRevision!==revision);
}
