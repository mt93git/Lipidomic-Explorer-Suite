// Render workers: the API may answer a card render on one of K worker processes while the main process serves
// the next request. Renders are "shared" (up to `capacity` in flight together); every other request stays
// exclusive and keeps the strict one-at-a-time order. capacity 1 is exactly the single-process behaviour.
import {expect,it,vi,afterEach} from 'vitest';
import { useAdminTokenFetch } from './api/adminToken';
useAdminTokenFetch(async () => new Response('{}', {status: 401}));
import {RequestQueue, requestQueue} from './prefetch';
afterEach(()=>{vi.unstubAllGlobals();requestQueue.capacity=1;});
const settle=()=>new Promise(r=>setTimeout(r,0));
function held(q:RequestQueue,name:string,seen:string[],options={}) {
 let end!:()=>void;
 const done=q.add(()=>new Promise<void>(r=>{seen.push(`start ${name}`);end=()=>{seen.push(`end ${name}`);r();};}),options);
 return {done,end:()=>end()};
}
it('capacity 3: three shared jobs are in flight together, the fourth waits until one ends',async()=>{
 const q=new RequestQueue();q.capacity=3;const seen:string[]=[];
 const jobs=['a','b','c','d'].map(n=>held(q,n,seen,{shared:true}));
 await settle();
 expect(seen).toEqual(['start a','start b','start c']);
 jobs[1].end();await settle();
 expect(seen).toEqual(['start a','start b','start c','end b','start d']);
 jobs[0].end();jobs[2].end();jobs[3].end();await Promise.all(jobs.map(j=>j.done));
});
it('an exclusive job waits for every shared job in flight, and a later shared job waits for it',async()=>{
 const q=new RequestQueue();q.capacity=3;const seen:string[]=[];
 const a=held(q,'a',seen,{shared:true}),b=held(q,'b',seen,{shared:true});
 await settle();expect(seen).toEqual(['start a','start b']);
 const patch=held(q,'patch',seen),c=held(q,'c',seen,{shared:true});
 await settle();expect(seen).toEqual(['start a','start b']);
 a.end();await settle();expect(seen).toEqual(['start a','start b','end a']);
 b.end();await settle();expect(seen).toEqual(['start a','start b','end a','end b','start patch']);
 patch.end();await settle();
 expect(seen).toEqual(['start a','start b','end a','end b','start patch','end patch','start c']);
 c.end();await Promise.all([a.done,b.done,patch.done,c.done]);
});
it('a waiting exclusive job is not overtaken by shared work of higher priority asked after it',async()=>{
 const q=new RequestQueue();q.capacity=3;const seen:string[]=[];
 const a=held(q,'a',seen,{shared:true});await settle();
 const patch=held(q,'patch',seen);await settle();
 const high=held(q,'high',seen,{shared:true});await settle();
 expect(seen).toEqual(['start a']);
 a.end();await settle();expect(seen).toEqual(['start a','end a','start patch']);
 patch.end();await settle();expect(seen).toEqual(['start a','end a','start patch','end patch','start high']);
 high.end();await Promise.all([a.done,patch.done,high.done]);
});
it('capacity 1 (default): shared jobs run one at a time in today\'s order',async()=>{
 const q=new RequestQueue();expect(q.capacity).toBe(1);const seen:string[]=[];
 const busy=held(q,'busy',seen,{shared:true});await settle();
 q.paused=true;
 const low=held(q,'low',seen,{shared:true,priority:()=> 'LOW' as const,distance:()=>0});
 const bg=held(q,'panel',seen,{background:true});
 const r1=held(q,'r1',seen,{shared:true}),r2=held(q,'r2',seen,{shared:true}),patch=held(q,'patch',seen);
 await settle();expect(seen).toEqual(['start busy']);
 busy.end();await settle();expect(seen.at(-1)).toBe('start r1');
 r1.end();await settle();expect(seen.at(-1)).toBe('start r2');
 r2.end();await settle();expect(seen.at(-1)).toBe('start patch');
 patch.end();await settle();expect(seen.at(-1)).toBe('start panel');
 bg.end();await settle();expect(seen.at(-1)).toBe('end panel');
 q.paused=false;q.refresh();await settle();expect(seen.at(-1)).toBe('start low');
 low.end();await Promise.all([busy.done,low.done,bg.done,r1.done,r2.done,patch.done]);
});
it.each([[undefined,1],[0,1],[2,3],[4,5],[99,5],[-3,1]])('openSession with renderWorkers %s sets capacity %i',async(workers,capacity)=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({sessionId:'s',...(workers===undefined?{}:{renderWorkers:workers})}),{headers:{'Content-Type':'application/json'}})));
 const {openSession}=await import('./api');
 const session=await openSession('cp');
 expect(session.renderWorkers).toBe(workers);
 expect(requestQueue.capacity).toBe(capacity);
});
it('card renders are sent together up to capacity; a card edit waits for them',async()=>{
 const finish:(()=>void)[]=[],paths:string[]=[];
 vi.stubGlobal('fetch',vi.fn((url:string)=>{paths.push(url.replace(/^.*\/sessions\/s/,''));return new Promise<Response>(r=>finish.push(()=>r(new Response(JSON.stringify({figure:{data:[],layout:{}}}),{headers:{'Content-Type':'application/json'}}))));}));
 const {renderCard,updateCard}=await import('./api');
 requestQueue.capacity=2;
 const r1=renderCard('s','a',400,300,'json'),r2=renderCard('s','b',400,300,'json',{priority:()=> 'HIGH'});
 const edit=updateCard('s','a',{x:1}),r3=renderCard('s','c',400,300,'json');
 await settle();
 expect(paths).toEqual(['/cards/a/render','/cards/b/render']);
 finish[0]();await settle();expect(paths).toHaveLength(2);
 finish[1]();await settle();expect(paths).toEqual(['/cards/a/render','/cards/b/render','/cards/a']);
 finish[2]();await settle();expect(paths.at(-1)).toBe('/cards/c/render');
 finish[3]();await Promise.all([r1,r2,edit,r3]);
});
// Read-only requests (dashboard plots, the cohort) change nothing on the server: they run beside card renders.
// Anything that writes (here setCohort) stays exclusive: it waits for all of them and runs alone.
it('a card render, a dashboard plot and the cohort are sent together; setCohort waits for all three',async()=>{
 const finish:(()=>void)[]=[],paths:string[]=[];
 vi.stubGlobal('fetch',vi.fn((url:string)=>{paths.push(url.replace(/^.*\/sessions\/s/,''));return new Promise<Response>(r=>finish.push(()=>r(new Response(JSON.stringify({figure:{data:[],layout:{}},lipids:[]}),{headers:{'Content-Type':'application/json'}}))));}));
 const {renderCard,getPlot,getCohort,setCohort}=await import('./api');
 requestQueue.capacity=3;
 const render=renderCard('s','a',400,300,'json'),plot=getPlot('s','pca',{},400),cohort=getCohort('s',{background:true});
 await settle();
 expect(paths).toEqual(['/cards/a/render','/plots/results_dashboard/pca','/cohort']);
 const write=setCohort('s',['PC 34:1']);await settle();
 finish[0]();finish[1]();await settle();expect(paths).toHaveLength(3);
 finish[2]();await settle();expect(paths.at(-1)).toBe('/cohort');expect(paths).toHaveLength(4);
 finish[3]();await Promise.all([render,plot,cohort,write]);
});
it('mock mode, capacity 3 with a render delay: the plot and the cohort finish while the render is in flight; setCohort runs after it',async()=>{
 vi.stubEnv('VITE_API_MOCK','1');vi.stubGlobal('window',{});vi.resetModules();
 const checkpoints=(await import('./mock/checkpoints.json')).default;
 const {openSession,createCard,renderCard,getPlot,getCohort,setCohort,getCatalog}=await import('./api');
 const queue=(await import('./prefetch')).requestQueue;
 const mock=(window as unknown as {__nexoPrefetchMock:{delayMs:number;workers:number}}).__nexoPrefetchMock;
 mock.workers=2;
 try {
  const session=await openSession(checkpoints[0].id);expect(queue.capacity).toBe(3);
  const source=(await getCatalog()).outputs.find(e=>e.render==='plotly')!.id;
  const card=await createCard(session.sessionId,source,{});
  mock.delayMs=50;
  const seen:string[]=[];const track=<T,>(name:string,p:Promise<T>)=>p.then(v=>(seen.push(name),v));
  const render=track('render',renderCard(session.sessionId,card.instanceId,400,300,'json'));
  const plot=track('plot',getPlot(session.sessionId,'pca',{},400));
  const cohort=track('cohort',getCohort(session.sessionId,{background:true}));
  await settle();
  const write=track('setCohort',setCohort(session.sessionId,[]));
  await Promise.all([render,plot,cohort,write]);
  expect(seen).toEqual(['plot','cohort','render','setCohort']);
 } finally {mock.delayMs=0;mock.workers=0;queue.capacity=1;}
});
