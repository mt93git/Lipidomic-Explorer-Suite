import { checkpointZip } from './archive';
import initial from './checkpoints.json';
import type { Checkpoint, Session } from '../api/types';
// In-memory mock server; sessionStorage is its reload bridge within this browser tab.
const key='nexo-mock-checkpoints-v1';
let saved: {record:Checkpoint;state:Session['canvas'];nexo?:import('../state/nexo').Nexo}[]=[];
if(import.meta.env.VITE_API_MOCK==='1'){try{const value=JSON.parse(sessionStorage.getItem(key) ?? '[]');if(Array.isArray(value))saved=value;}catch{/* A stale mock cache must not block boot. */}}
const persist=()=>sessionStorage.setItem(key,JSON.stringify(saved));
// Start's empty state (sessionStorage 'nexo-mock-entry' = 'empty', mock/entry.ts) has no checkpoints either.
const emptyEntry=()=>{try{return sessionStorage.getItem('nexo-mock-entry')==='empty';}catch{return false;}};
export const checkpointRecords=():Checkpoint[]=>emptyEntry()?[]:[...initial.map(c=>({...c,sizeBytes:c.bytes,createdAt:'2026-01-01T00:00:00Z',source:'folder' as const})),...saved.map(c=>c.record)];
export const checkpointCanvas=(id:string)=>structuredClone(saved.find(c=>c.record.id===id)?.state);
export const checkpointNexo=(id:string)=>structuredClone(saved.find(c=>c.record.id===id)?.nexo);
export async function putCheckpoint(name:string,state:unknown,nexo?:import('../state/nexo').Nexo):Promise<Checkpoint>{
 if(!name.trim()||Array.from(name.trim()).length>80)throw Error('Checkpoint name must be 1–80 characters');
 const bytes=new Uint8Array(await checkpointZip(state,name.trim(),nexo).arrayBuffer());const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 const record:Checkpoint={id:sha256,name:name.trim(),sizeBytes:bytes.length,sha256,createdAt:new Date().toISOString(),source:'store'};
 saved=saved.filter(c=>c.record.id!==record.id);saved.push({record,nexo:structuredClone(nexo),state:structuredClone(state) as Session['canvas']});persist();return record;
}
export function removeCheckpoint(id:string){saved=saved.filter(c=>c.record.id!==id);persist();}
