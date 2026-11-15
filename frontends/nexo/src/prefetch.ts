export interface RequestOptions {
 priority?: () => 'HIGH' | 'LOW';
 distance?: () => number;
 valid?: () => boolean;
 /** Panel data (cohort, checkpoint list): after the cards in view, before prefetch, never paused. */
 background?: boolean;
 /** May run beside other shared work (card renders on the API's render workers); anything else runs alone.
  * Only read-only requests may be shared (renderCard, getPlot, getCohort). Nothing that writes may be:
  * setCohort, createCard/updateCard/deleteCard, confirmDesign, analysis updates, statistics, canvas
  * validate/save, checkpoints and export stay exclusive (they wait for shared work and run alone). */
 shared?: boolean;
}
interface Job { run:()=>Promise<unknown>; resolve:(v:unknown)=>void; reject:(e:unknown)=>void; options:RequestOptions; highOrder?:number }
/** One transport owner. Re-evaluate visibility, validity and distance immediately before send. */
export class RequestQueue {
 paused=false;
 /** Shared jobs allowed in flight together; 1 is strictly one request at a time. */
 capacity=1;
 private inFlight=0;
 private exclusive=false;
 private scheduled=false;
 private sequence=0;
 private jobs:Job[]=[];
 add<T>(run:()=>Promise<T>,options:RequestOptions={}):Promise<T> {
  return new Promise<T>((resolve,reject)=>{this.jobs.push({run,resolve:resolve as (v:unknown)=>void,reject,options});this.refresh();});
 }
 refresh() {
  this.jobs=this.jobs.filter(j=>{if(j.options.valid?.()===false){j.reject(new Error('Prefetch superseded'));return false;}return true;});
  for(const job of this.jobs) {
   if(!job.options.background&&job.options.priority?.()!=='LOW')job.highOrder??=this.sequence++;
   else job.highOrder=undefined;
  }
  if(this.scheduled)return;
  this.scheduled=true;
  queueMicrotask(()=>{this.scheduled=false;this.dispatch();});
 }
 private dispatch() {
  // Dispatch in a microtask so a HIGH added in this turn precedes unsent LOW work.
  this.jobs=this.jobs.filter(j=>{if(j.options.valid?.()===false){j.reject(new Error('Prefetch superseded'));return false;}return true;});
  while(!this.exclusive&&this.inFlight<this.capacity) {
   const high=this.jobs.reduce((best,j,i)=>j.highOrder!==undefined&&(best<0||j.highOrder<this.jobs[best].highOrder!)?i:best,-1);
   const background=high<0?this.jobs.findIndex(j=>j.options.background):-1;
   if(high<0&&background<0&&this.paused)return;
   const index=high>=0?high:background>=0?background:this.jobs.reduce((best,j,i)=>best<0||(j.options.distance?.()??0)<(this.jobs[best].options.distance?.()??0)?i:best,-1);
   // The next exclusive job waits for the shared work in flight; later shared jobs do not overtake it.
   if(index<0||(!this.jobs[index].options.shared&&this.inFlight>0))return;
   const [job]=this.jobs.splice(index,1);this.inFlight++;this.exclusive=!job.options.shared;
   void (async()=>{
    try {job.resolve(await job.run());}catch(error){job.reject(error);}
    finally {this.inFlight--;this.exclusive=false;this.refresh();}
   })();
  }
 }
}
export function prefetchEnabled(storage:Pick<Storage,'getItem'>,readOnly:boolean) {
 try{return !readOnly&&storage.getItem('nexo.prefetch')!=='off';}catch{return !readOnly;}
}
export const requestQueue=new RequestQueue();
