/** Targeted lipid cohort selection: pure helpers the panel and its tests share. */
export interface CohortLipid { lipid:string; class:string }
export interface ClassGroup { class:string; lipids:string[] }
/** Search matches a lipid name or its class; groups keep the server's lipid order, classes sort by name. */
export function groupByClass(available:readonly CohortLipid[], query:string):ClassGroup[] {
 const q=query.trim().toLowerCase(), groups=new Map<string,string[]>();
 for (const {lipid, class:c} of available) {
  if (q && !lipid.toLowerCase().includes(q) && !c.toLowerCase().includes(q)) continue;
  const list=groups.get(c) ?? []; list.push(lipid); groups.set(c,list);
 }
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([c,lipids])=>({class:c,lipids}));
}
export function toggle(selected:ReadonlySet<string>, lipid:string):Set<string> {
 const next=new Set(selected); if (next.has(lipid)) next.delete(lipid); else next.add(lipid); return next;
}
export function setClass(selected:ReadonlySet<string>, lipids:readonly string[], on:boolean):Set<string> {
 const next=new Set(selected); lipids.forEach(l=>on ? next.add(l) : next.delete(l)); return next;
}
export const selectAll = (selected:ReadonlySet<string>, visible:readonly string[]) => setClass(selected,visible,true);
export function invert(selected:ReadonlySet<string>, visible:readonly string[]):Set<string> {
 const next=new Set(selected); visible.forEach(l=>next.has(l) ? next.delete(l) : next.add(l)); return next;
}
/** The PUT body: the selection in the available order; names the dataset no longer has are left out. */
export const applyPayload = (selected:ReadonlySet<string>, available:readonly CohortLipid[]) => available.map(a=>a.lipid).filter(l=>selected.has(l));
