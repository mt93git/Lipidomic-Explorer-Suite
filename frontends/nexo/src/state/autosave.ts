export type Status='idle'|'dirty'|'saving'|'saved'|'error'|'paused'|'offline';
export const OFFLINE_TEXT="Can't reach the server · retrying";
/** Small fixes item 4: the API is down or restarting (no answer, 500, 502, 503, 504): one pill status, retried with backoff. */
export function isOutage(error:unknown){const e=error as {status?:unknown;name?:unknown;message?:unknown}|null;
 if(!e||typeof e!=='object')return false;if(typeof e.status==='number')return [0,500,502,503,504].includes(e.status);
 return e.name==='TypeError'&&/fetch|network|load failed/i.test(String(e.message));}
/** A lost session (409 session_lost, or SessionLostError once the automatic reopen failed): no retry, the pill offers Reopen. */
const isLost=(error:unknown)=>{const e=error as {status?:unknown;code?:unknown;retryable?:unknown}|null;return !!e&&typeof e==='object'&&(e.retryable===false||(e.status===409&&e.code==='session_lost'));};
const OUTAGE_DELAYS=[5000,10000,20000,40000,60000];
export interface Clock { now(): number; setTimeout(fn:()=>void,ms:number): ReturnType<typeof setTimeout>; clearTimeout(id:ReturnType<typeof setTimeout>):void }
export function createAutosave({save,clock={now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}:{save:(token:string)=>Promise<unknown>;clock?:Clock}) {
 let revision=0,savedRevision=0,sequence=0,flight:string|null=null,retries=0,paused=false,readonly=false,outages=0,lost=false;
 let status:Status='idle',text='Saved workspace restored',failure='';
 // Steph review row 12: the document as opened or last saved, and the latest one seen. A change undone back to it is
 // not an unsaved change; the pill returns to what it said then.
 let cleanContent:string|undefined,content:string|undefined,clean:{status:Status;text:string}={status:'idle',text:'Saved workspace restored'};
 const listeners=new Set<()=>void>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const emit=(s:Status,t:string)=>{status=s;text=t;listeners.forEach(fn=>fn());};
 const clear=(key:string)=>{const id=timers.get(key);if(id!==undefined)clock.clearTimeout(id);timers.delete(key);};
 const clearAll=()=>{[...timers.keys()].forEach(clear);};
 const timer=(key:string,ms:number,fn:()=>void)=>{clear(key);timers.set(key,clock.setTimeout(()=>{timers.delete(key);fn();},ms));};
 async function flush() {
  if(flight||paused||readonly||lost||revision===savedRevision)return;
  clearAll(); const token=`save-${++sequence}`,committed=revision,committedContent=content; flight=token;if(!outages)emit('saving','Saving…');
  const finish=(error?:unknown)=>{
   if(flight!==token)return;clear('watchdog');flight=null;
   if(paused||readonly)return;
   if(error&&isOutage(error)){const ms=OUTAGE_DELAYS[Math.min(outages++,OUTAGE_DELAYS.length-1)];if(status!=='offline')emit('offline',OFFLINE_TEXT);timer('retry',ms,()=>void flush());return;}
   if(error&&isLost(error)){outages=0;lost=true;failure=(error instanceof Error?error.message:String(error)).replace(/^Error:\s*/,'');emit('error','Save failed · Session lost');return;}
   outages=0;
   if(error){const busy=/busy|already in progress/i.test(String(error));if(!busy)failure=(error instanceof Error?error.message:String(error)).replace(/^Error:\s*/,'');const fatal=(error as {retryable?:unknown})?.retryable===false,retry=!fatal&&(!busy||retries++<24);emit(busy&&retry?'saving':'error',busy&&retry?'Saving…':fatal?'Save failed · Session lost':'Save failed · Retrying');if(retry)timer('retry',5000,()=>void flush());return;}
   retries=0;failure='';savedRevision=committed;cleanContent=committedContent;
   if(revision===committed){emit('saved',`Saved · ${new Date(clock.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);clean={status,text};}
   else {emit('dirty','Unsaved changes · Autosave on');timer('debounce',1000,()=>void flush());}
  };
  timer('watchdog',135000,()=>finish(Error('Save response timed out.')));
  try {await save(token);finish();}catch(error){finish(error);}
 }
 return {
  state:()=>({status,text,revision,savedRevision,failure,lost}),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},flush,
  /** The document as opened (or as the server holds it): changes undone back to it are not unsaved. */
  baseline(value:string){cleanContent=content=value;},
  /** content: the document after the change. Back to the opened or last saved document, nothing is left to save. */
  markDirty(value?:string){
   if(value!==undefined){content=value;
    if(cleanContent!==undefined&&value===cleanContent&&!flight&&!paused&&!readonly&&!lost&&!outages){revision=savedRevision;clearAll();emit(clean.status,clean.text);return;}}
   revision++;if(paused||readonly||flight||lost||outages)return;emit('dirty','Unsaved changes · Autosave on');timer('debounce',15000,()=>void flush());if(!timers.has('maximum'))timer('maximum',60000,()=>void flush());},
  pause(viewOnly=false){paused=true;readonly=viewOnly;flight=null;retries=0;clearAll();emit('paused',viewOnly?'View-only access':'Autosave paused');},
  resume(){paused=false;readonly=false;if(revision!==savedRevision){emit('dirty','Unsaved changes · Autosave on');timer('debounce',15000,()=>void flush());timer('maximum',60000,()=>void flush());}else emit('idle','Saved workspace restored');},
  /** The session was reopened (the pill's Reopen, or recovery): saving starts again at once; the edits were kept. */
  reopened(){lost=false;outages=0;retries=0;failure='';if(revision!==savedRevision)void flush();else emit('idle','Saved workspace restored');},
  /** The automatic reopen failed: the pill offers Reopen; nothing is retried until then. */
  markLost(message:string){lost=true;flight=null;outages=0;clearAll();failure=message;emit('error','Save failed · Session lost');},
  dispose(){clearAll();flight=null;listeners.clear();}
 };
}
export type Autosave=ReturnType<typeof createAutosave>;
