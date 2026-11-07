// A server reply belongs to the request that sent it. When a restore is replaced
// by a newer restore with the same instance id:
//  - a delayed retry of the old reply (its output was not there yet) must not
//    rewrite the new request's settings;
//  - an old reply that arrives after the new request exists (its echoed token
//    differs) is ignored, and so is a reply or error without a token.
// Usage: node tests/dual-ui/test_team_instance_reply_identity.cjs [path/to/canvas.js]
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(process.argv[2]||'www/team/js/canvas.js','utf8');
const piece=(a,b)=>{const i=code.indexOf(a),j=code.indexOf(b);assert(i>=0&&j>i,'canvas.js no longer contains '+a);return code.slice(i,j);};
const src=piece('  function requestInstance(','  function setInstanceInputs(')+piece('  function waitInstanceInputs(','  function humanize(');
let now=0,next=0;const jobs=new Map(),applied=[],sent=[];
function output(name){return {id:name,isConnected:true,parentElement:{closest:()=>null},classList:{contains:()=>false,add(){},remove(){}}};}
const dom={};
const errors=[];
const ctx={instanceRequests:new Map(),staleSnapshot(){},TeamCanvasStatistics:null,figureCount:()=>0,instanceRequestSequence:0,dropStaleHost(){},records:new Map(),illustrations:new Map(),csvByPlot:{},window:{Shiny:{},jQuery:null},
  Shiny:{setInputValue:(n,v)=>sent.push([n,v]),shinyapp:{$inputValues:{}}},
  document:{documentElement:{classList:{contains:()=>false}},getElementById:id=>dom[id]||null},
  shinyBusy:false,instanceSupported:()=>true,instanceValues:()=>({}),cellSourceValues:()=>({}),plotTitle:()=> 'Violin',
  tell:x=>{if(/error/.test(x))errors.push(x);},restoreStatus(){},parkInstance(){},setInstanceInputs:i=>applied.push(JSON.parse(JSON.stringify(i.inputs))),openInstanceControls(){},failInstance:(r,e)=>{throw e;},
  watchRender(){},renderList(){},changed(){},hydratePending(){},restorePending:new Map(),settleRestored(){},trackRestoredInputs(){},scheduleDeferred(){},mountingDeferred:false,
  add:r=>{r.node={};return true;},presentNewNode(){},rememberGeometry(){},TeamCanvasFloatingPanel:{open(){}},requestAnimationFrame:f=>f(),
  console,setTimeout:(fn,ms)=>{const id=++next;jobs.set(id,{fn,t:now+ms});return id;},clearTimeout:id=>jobs.delete(id),Date:{now:()=>now},Math,Array,Object,JSON,String};
vm.createContext(ctx);vm.runInContext(src+'\nthis.__ready=instanceReady;this.__error=instanceError;',ctx);
function advance(ms){const end=now+ms;for(;;){const a=[...jobs].sort((x,y)=>x[1].t-y[1].t)[0];if(!a||a[1].t>end)break;jobs.delete(a[0]);now=a[1].t;a[1].fn();}now=end;}
const id='tcinstance_same',source='results_dashboard-plot_violin',out=id+'-plot_violin';
const saved=lipid=>({id:out,label:'Same',instance:{id,source,inputs:{violin_lipid:lipid}}});
function cancel(){const r=ctx.instanceRequests.get(id);ctx.clearTimeout(r.timer);ctx.instanceRequests.delete(id);}
const token=()=>sent.filter(x=>x[0]==='team_canvas_instance_create').pop()[1].request;
dom[id+'_host']={addEventListener(){},classList:{contains:()=>false}};
// 1. The old reply arrives before the copy's output exists and retries; the newer restore then initializes.
assert(ctx.requestInstance(source,null,saved('old')));const tokenA=token();
ctx.__ready({id,source,inputs:{violin_lipid:'old'},allowedInputs:['violin_lipid'],generation:1,request:tokenA},0);
assert.equal(applied.length,0,'no output yet: the old reply waits');
cancel();assert(ctx.requestInstance(source,null,saved('new')));const reqB=ctx.instanceRequests.get(id),tokenB=token();
dom[out]=output(out);dom[id+'-violin_lipid']={};
ctx.__ready({id,source,inputs:{violin_lipid:'new'},allowedInputs:['violin_lipid'],generation:2,request:tokenB},0);
advance(500);
assert.ok(applied.length>0&&applied.every(x=>x.violin_lipid==='new'),'only the newer restore\'s settings were applied: '+JSON.stringify(applied));
assert.equal(reqB.instance.inputs.violin_lipid,'new','the delayed retry of the old reply did not rewrite the newer request');
assert.ok(tokenA&&tokenB&&tokenA!==tokenB,'each request has its own token');
// 2. An old reply arriving after the new request exists is ignored by its token.
applied.length=0;ctx.instanceRequests.clear();delete dom[out];
assert(ctx.requestInstance(source,null,saved('old2')));const tokenC=token();cancel();
assert(ctx.requestInstance(source,null,saved('new2')));const reqD=ctx.instanceRequests.get(id);
dom[out]=output(out);
ctx.__ready({id,source,inputs:{violin_lipid:'old2'},allowedInputs:['violin_lipid'],generation:3,request:tokenC},0);
advance(200);
assert.deepEqual(applied,[],'a reply carrying the cancelled request\'s token is ignored');
assert.equal(reqD.instance.inputs.violin_lipid,'new2');
// 3. Every request carries a token: a reply without one is stale, ready or error.
const before=applied.length;
ctx.__ready({id,source,inputs:{violin_lipid:'old2'},allowedInputs:['violin_lipid'],generation:4},0);
advance(200);
assert.equal(applied.length,before,'a token-less ready reply is ignored');
assert.ok(applied.every(x=>x.violin_lipid==='new2'));
assert.equal(reqD.instance.inputs.violin_lipid,'new2','a token-less ready reply never rewrites the current request');
ctx.__error({id,message:'stale analysis error'});
assert.equal(ctx.instanceRequests.get(id),reqD,'a token-less error leaves the current request alone');
ctx.__error({id,message:'stale request error',request:tokenC});
assert.equal(ctx.instanceRequests.get(id),reqD,'an error with a cancelled request\'s token leaves the current request alone');
assert.equal(errors.length,0,'no failure was recorded for the current request');
ctx.__error({id,message:'its own error',request:reqD.token});
assert.ok(!ctx.instanceRequests.has(id),'an error with the current token ends that request');
assert.equal(errors.length,1);
console.log('PASS a cancelled restore\'s reply (delayed retry, late arrival, or no token; ready or error) never initializes or cancels a newer request with the same id');
