import {expect,it,vi,afterEach} from 'vitest';
import {RequestQueue, prefetchEnabled} from './prefetch';
afterEach(()=>vi.useRealTimers());
it('serves HIGH FIFO before LOW sorted by current distance, re-sorting on camera change',async()=>{
 const q=new RequestQueue(), seen:string[]=[];let release!:()=>void;
 const busy=q.add(()=>new Promise<void>(r=>{release=r;}));await Promise.resolve();
 let distance=9;
 const a=q.add(async()=>{seen.push('a');},{priority:()=> 'LOW',distance:()=>distance});
 const b=q.add(async()=>{seen.push('b');},{priority:()=> 'LOW',distance:()=>4});
 const h=q.add(async()=>{seen.push('high');});distance=1;q.refresh();release();
 await Promise.all([busy,a,b,h]);expect(seen).toEqual(['high','a','b']);
});
it('drops unsent removed or changed work and pauses/resumes LOW',async()=>{
 const q=new RequestQueue();q.paused=true;const run=vi.fn(async()=>1);let valid=true;
 const dropped=q.add(run,{priority:()=> 'LOW',valid:()=>valid}).catch(()=>undefined);
 valid=false;q.refresh();await dropped;expect(run).not.toHaveBeenCalled();
 const next=q.add(run,{priority:()=> 'LOW'});await Promise.resolve();expect(run).not.toHaveBeenCalled();q.paused=false;q.refresh();await next;expect(run).toHaveBeenCalledOnce();
});
it('promotes a now-visible queued render to HIGH',async()=>{
 const q=new RequestQueue();q.paused=true;let visible=false;const run=vi.fn(async()=>1);
 const p=q.add(run,{priority:()=>visible?'HIGH':'LOW'});visible=true;q.refresh();await p;expect(run).toHaveBeenCalledOnce();
});
it('disables prefetch with localStorage off and on read-only phones',()=>{
 expect(prefetchEnabled({getItem:()=> 'off'},false)).toBe(false);
 expect(prefetchEnabled({getItem:()=>null},true)).toBe(false);
 expect(prefetchEnabled({getItem:()=>null},false)).toBe(true);
});
it('does not retry a 503 while another API request is in flight',async()=>{
 vi.useFakeTimers();
 const {renderCard,getCatalog}=await import('./api');
 let finish!:(r:Response)=>void;
 const response=()=>new Response(JSON.stringify({figure:{data:[],layout:{}}}),{headers:{'Content-Type':'application/json'}});
 const fetch=vi.fn().mockResolvedValueOnce(new Response('{}',{status:503})).mockImplementationOnce(()=>new Promise<Response>(r=>{finish=r;})).mockImplementation(async()=>response());
 vi.stubGlobal('fetch',fetch);
 try {
  const first=renderCard('s','a',400,300,'json');
  await vi.advanceTimersByTimeAsync(500);expect(fetch).toHaveBeenCalledTimes(2);
  const second=getCatalog();await vi.advanceTimersByTimeAsync(5000);
  expect(fetch).toHaveBeenCalledTimes(2);
  finish(response());await first;await second;expect(fetch).toHaveBeenCalledTimes(3);
 } finally {vi.unstubAllGlobals();}
});
it.each(['removed','inputs changed','size changed'])('drops queued prefetch when %s',async()=>{
 const q=new RequestQueue();q.paused=true;let key='original';const run=vi.fn(async()=>1);
 const p=q.add(run,{priority:()=> 'LOW',valid:()=>key==='original'}).catch(()=>undefined);
 key='changed';q.refresh();await p;expect(run).not.toHaveBeenCalled();
});
it('keeps existing HIGH order when an older LOW is promoted, and never aborts sent LOW',async()=>{
 const q=new RequestQueue(),seen:string[]=[];let finish!:()=>void,visible=false;
 const sent=q.add(()=>new Promise<void>(resolve=>{finish=()=>{seen.push('sent');resolve();};}),{priority:()=> 'LOW'});
 await Promise.resolve();
 const promoted=q.add(async()=>{seen.push('promoted');},{priority:()=>visible?'HIGH':'LOW'});
 const h1=q.add(async()=>{seen.push('h1');}),h2=q.add(async()=>{seen.push('h2');});
 visible=true;q.refresh();expect(seen).toEqual([]);finish();
 await Promise.all([sent,promoted,h1,h2]);expect(seen).toEqual(['sent','h1','h2','promoted']);
});
it('allows HIGH during a prefetch pause and recovers after request failure',async()=>{
 const q=new RequestQueue();q.paused=true;const seen:string[]=[];
 const low=q.add(async()=>{seen.push('low');},{priority:()=> 'LOW'});
 await expect(q.add(async()=>{throw Error('failed');})).rejects.toThrow('failed');
 await q.add(async()=>{seen.push('high');});expect(seen).toEqual(['high']);
 q.paused=false;q.refresh();await low;expect(seen).toEqual(['high','low']);
});
it('lets a HIGH added in the same turn overtake an unsent LOW',async()=>{
 const q=new RequestQueue(),seen:string[]=[];
 const low=q.add(async()=>{seen.push('low');},{priority:()=> 'LOW'});
 const high=q.add(async()=>{seen.push('high');});
 await Promise.all([low,high]);expect(seen).toEqual(['high','low']);
});
