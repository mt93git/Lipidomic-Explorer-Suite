// Regression: adding the Violin distributions card (logratio_tab-logratioPlot) never
// finished. In Team, the copy's plotOutput lives inside the scrollable_plot_ui
// renderUI, which re-renders while the copy's inputs settle and replaces the element
// first found. The instance must mount the live element, not the detached one.
// Usage: node tests/dual-ui/test_team_instance_replaced_output.cjs [path/to/canvas.js]
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(process.argv[2]||'www/team/js/canvas.js','utf8');
const piece=(a,b)=>{const i=code.indexOf(a),j=code.indexOf(b);assert(i>=0&&j>i,'canvas.js no longer contains '+a);return code.slice(i,j);};
const src=piece('  function requestInstance(','  function setInstanceInputs(')+piece('  function waitInstanceInputs(','  function humanize(');
let now=0,next=0;const jobs=new Map(),mounted=[],messages=[];
const ID_RE=/^tcinstance_[a-z0-9_]+$/;
function output(name){return {id:name,isConnected:true,parentElement:{closest:()=>({id:'scrollable_plot_ui'})},classList:{contains:()=>false}};}
const dom={};
const ctx={instanceRequests:new Map(),records:new Map(),illustrations:new Map(),csvByPlot:{},window:{Shiny:{},jQuery:null},
  Shiny:{setInputValue(){},shinyapp:{$inputValues:{}}},
  document:{documentElement:{classList:{contains:()=>false}},getElementById:id=>dom[id]||null},
  shinyBusy:false,instanceSupported:()=>true,instanceValues:()=>({scaleMode:'log2fc'}),cellSourceValues:()=>({}),plotTitle:()=> 'Violin distributions',
  tell:x=>messages.push(x),restoreStatus(){},parkInstance(){},setInstanceInputs(){},openInstanceControls(){},failInstance:(r,e)=>{throw e;},
  watchRender(){},renderList(){},changed(){},hydratePending(){},restorePending:new Map(),
  add:r=>{mounted.push(r.el);if(!r.el.isConnected)return false;r.node={};return true;},
  presentNewNode(){},rememberGeometry(){},TeamCanvasFloatingPanel:{open(){}},requestAnimationFrame:f=>f(),
  console,setTimeout:(fn,ms)=>{const id=++next;jobs.set(id,{fn,t:now+ms});return id;},clearTimeout:id=>jobs.delete(id),Date:{now:()=>now},Math,Array,Object,JSON,String};
vm.createContext(ctx);vm.runInContext(src+'\nthis.__ready=instanceReady;',ctx);
function advance(ms){const end=now+ms;for(;;){const a=[...jobs].sort((x,y)=>x[1].t-y[1].t)[0];if(!a||a[1].t>end)break;jobs.delete(a[0]);now=a[1].t;a[1].fn();}now=end;}
assert(ctx.requestInstance('logratio_tab-logratioPlot'));
const req=[...ctx.instanceRequests.values()][0],id=req.instance.id;assert(ID_RE.test(id));
dom[id+'_host']={addEventListener(){},classList:{contains:()=>false}};dom[id+'-scaleMode']={};const first=output(id+'-logratioPlot');dom[first.id]=first;
ctx.Shiny.shinyapp.$inputValues[id+'-scaleMode']='other';
ctx.__ready({id,source:req.source,inputs:{scaleMode:'log2fc'},allowedInputs:['scaleMode'],generation:1},0);
advance(300);
// renderUI replaces the plot output while the copy's settings are still arriving.
first.isConnected=false;const second=output(id+'-logratioPlot');dom[second.id]=second;
ctx.Shiny.shinyapp.$inputValues[id+'-scaleMode']='log2fc';
advance(2000);
assert.equal(mounted.length,1,'the copy is mounted once its inputs settle');
assert.equal(mounted[0],second,'the live output is mounted, not the element renderUI replaced');
assert(mounted[0].isConnected&&ctx.records.get(id+'-logratioPlot').node,'the card exists');
assert(!ctx.instanceRequests.has(id),'the request completed');
// Between renders the output can be momentarily absent: keep waiting under the
// request's own deadline instead of dropping it.
assert(ctx.requestInstance('logratio_tab-logratioPlot'));
const req2=[...ctx.instanceRequests.values()][0],id2=req2.instance.id;dom[id2+'_host']={addEventListener(){},classList:{contains:()=>false}};dom[id2+'-scaleMode']={};
const a=output(id2+'-logratioPlot');dom[a.id]=a;ctx.Shiny.shinyapp.$inputValues[id2+'-scaleMode']='log2fc';
ctx.__ready({id:id2,source:req2.source,inputs:{scaleMode:'log2fc'},allowedInputs:['scaleMode'],generation:1},0);
advance(50);a.isConnected=false;delete dom[a.id];advance(1500);
assert(ctx.instanceRequests.has(id2),'a temporarily absent output keeps the request pending');
const b=output(id2+'-logratioPlot');dom[b.id]=b;advance(1500);
assert.equal(mounted[mounted.length-1],b,'the re-rendered output is mounted');assert(!ctx.instanceRequests.has(id2));
// A queued retry must not mount a replacement request that reuses the same id.
assert(ctx.requestInstance('logratio_tab-logratioPlot'));
const req3=[...ctx.instanceRequests.values()][0],id3=req3.instance.id;dom[id3+'_host']={addEventListener(){},classList:{contains:()=>false}};dom[id3+'-scaleMode']={};
const c=output(id3+'-logratioPlot');dom[c.id]=c;ctx.Shiny.shinyapp.$inputValues[id3+'-scaleMode']='log2fc';
ctx.__ready({id:id3,source:req3.source,inputs:{scaleMode:'log2fc'},allowedInputs:['scaleMode'],generation:1},0);
advance(50);c.isConnected=false;delete dom[c.id];advance(1500);assert(ctx.instanceRequests.get(id3)===req3,'waiting for the output');
const replacement={instance:req3.instance,source:req3.source,timer:null};ctx.instanceRequests.set(id3,replacement);
const mountedBefore=mounted.length;const d=output(id3+'-logratioPlot');dom[d.id]=d;advance(1500);
assert.equal(mounted.length,mountedBefore,'a stale retry does not mount');assert(ctx.instanceRequests.get(id3)===replacement,'the replacement request is untouched');
assert(!messages.some(x=>/did not load/.test(x)),'no timeout');
console.log('PASS instance mounts the live output after its renderUI boundary re-renders');
