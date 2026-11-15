// Mock of frontends/nexo-api/cohort.R: synthetic lipids only; the cohort is kept per session and travels
// with a saved checkpoint as the real nexo-targeted-cohort-v1.json member does.
export interface CohortState { active:boolean; lipids:string[]; available:{lipid:string;class:string}[] }
const available = [
 ['PC(16:0/18:1)','PC'],['PC(16:0/18:2)','PC'],['PC(18:0/20:4)','PC'],['PC(18:1/18:1)','PC'],
 ['PE(16:0/18:1)','PE'],['PE(18:0/20:4)','PE'],['PE(18:1/18:2)','PE'],
 ['TG(50:1)','TG'],['TG(52:2)','TG'],['TG(52:3)','TG'],['TG(54:3)','TG'],['TG(54:4)','TG'],
 ['Cer(d18:1/16:0)','Cer'],['Cer(d18:1/24:0)','Cer'],['Cer(d18:1/24:1)','Cer'],
 ['SM(d18:1/16:0)','SM'],['SM(d18:1/18:0)','SM'],
 ['LPC(16:0)','LPC'],['LPC(18:1)','LPC'],
].map(([lipid,c])=>({lipid,class:c}));
const key='nexo-mock-cohort-v1';
const bySession=new Map<string,string[]>();
let byCheckpoint:Record<string,string[]>={};
try { const v=JSON.parse(sessionStorage.getItem(key) ?? '{}'); if (v && typeof v==='object' && !Array.isArray(v)) byCheckpoint=v; } catch { /* A stale mock cache must not block boot. */ }
const state=(lipids:string[]):CohortState=>({active:lipids.length>0, lipids:[...lipids], available:structuredClone(available)});
export const mockCohortCounters={puts:[] as string[][]};
export const mockCohortGet=(session:string)=>state(bySession.get(session) ?? []);
export function mockCohortPut(session:string, body:unknown):CohortState {
 const bad=(message:string)=>{ throw Object.assign(new Error(message),{status:400,error:'api_bad_request'}); };
 const raw=(body as {lipids?:unknown})?.lipids ?? [];
 if (!Array.isArray(raw) || !raw.every(l=>typeof l==='string')) bad('Expected a list of lipid names.');
 const lipids=[...new Set((raw as string[]).filter(Boolean))], unknown=lipids.filter(l=>!available.some(a=>a.lipid===l));
 if (unknown.length) bad(`Unknown lipid: ${unknown.slice(0,5).join(', ')}`);
 bySession.set(session,lipids); mockCohortCounters.puts.push(lipids); return state(lipids);
}
export function mockCohortSaved(session:string, checkpoint:string) {
 const lipids=bySession.get(session) ?? [];
 if (lipids.length) byCheckpoint[checkpoint]=lipids; else delete byCheckpoint[checkpoint];
 try { sessionStorage.setItem(key,JSON.stringify(byCheckpoint)); } catch { /* Quota: the mock keeps it in memory. */ }
}
export const mockCohortOpened=(checkpoint:string, session:string)=>{ bySession.set(session,[...(byCheckpoint[checkpoint] ?? [])]); };
