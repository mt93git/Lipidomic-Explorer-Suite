// Cold open (H9): between the session and the first render the client asked for the catalog twice (canvas and
// library) and for the cohort and the checkpoint list ahead of the renders, on the single R process (~1.6 s on the
// pilot checkpoint). The catalog is asked once; panel data (the cohort) waits behind the cards in view, never paused.
// The checkpoint list stays first: it names the project in the top bar.
import {expect,it,vi,afterEach} from 'vitest';
import { useAdminTokenFetch } from './api/adminToken';
useAdminTokenFetch(async () => new Response('{}', {status: 401}));
import {RequestQueue} from './prefetch';
afterEach(()=>{vi.unstubAllGlobals();});
it('serves background work after HIGH and before LOW, even while LOW is paused',async()=>{
 const q=new RequestQueue(),seen:string[]=[];let release!:()=>void;
 const busy=q.add(()=>new Promise<void>(r=>{release=r;}));await Promise.resolve();
 q.paused=true;
 const low=q.add(async()=>{seen.push('low');},{priority:()=> 'LOW',distance:()=>0});
 const bg=q.add(async()=>{seen.push('panel');},{background:true});
 const high=q.add(async()=>{seen.push('render');});
 release();await Promise.all([busy,bg,high]);
 expect(seen).toEqual(['render','panel']);
 q.paused=false;q.refresh();await low;expect(seen).toEqual(['render','panel','low']);
});
it('asks for the catalog once and gives every caller its own copy',async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({outputs:[{id:'a',family:'f'}]}),{headers:{'Content-Type':'application/json'}}));
 vi.stubGlobal('fetch',fetch);
 const {getCatalog}=await import('./api');
 const [one,two]=await Promise.all([getCatalog(),getCatalog()]);
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(one).toEqual(two);expect(one).not.toBe(two);
 (one.outputs as {id:string}[])[0].id='changed';expect((two.outputs as {id:string}[])[0].id).toBe('a');
 expect((await getCatalog()).outputs[0].id).toBe('a');expect(fetch).toHaveBeenCalledTimes(1);
});
