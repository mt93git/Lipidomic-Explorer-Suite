// usage: node check_team_distribution_payload_unpack.cjs CLASSIC.json TEAM.json
// Runs www/team/js/plot_payload.js on the packed Team Signal distribution payload and
// requires the exact Classic x/y arrays (values, order) and the same order of shared keys.
const fs=require('fs'),path=require('path');
global.window=global;
require(path.join(__dirname,'../../www/team/js/plot_payload.js'));
const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).x,t=JSON.parse(fs.readFileSync(process.argv[3],'utf8')).x;
if(!TeamPlotPayload.unpack(t)||'teamPacked' in t)throw Error('not unpacked');
if(c.data.length!==t.data.length)throw Error('trace count');
let n=0;
for(let i=0;i<c.data.length;i++){const a=c.data[i],b=t.data[i];
 if(!Array.isArray(b.x)||!Array.isArray(b.y)||a.x.length!==b.x.length||a.y.length!==b.y.length)throw Error('length '+i);
 for(let k=0;k<a.y.length;k++){if(a.x[k]!==b.x[k]||!Object.is(a.y[k],b.y[k]))throw Error('value '+i+':'+k);n++;}
 // Team adds fillcolor/meta (checked in R); the shared keys keep their order.
 if(Object.keys(a).join()!==Object.keys(b).filter(k=>k in a).join())throw Error('key order '+i);}
console.log('JS unpack identical: '+c.data.length+' traces, '+n+' points');
// Damaged or inconsistent payloads: every trace is validated first, so the whole value stays
// exactly as received (teamPacked kept, earlier valid traces untouched) and unpack returns false.
const fresh=()=>JSON.parse(fs.readFileSync(process.argv[3],'utf8')).x;
const warn=console.warn;console.warn=()=>{};
const b64=a=>Buffer.from(new Float64Array(a).buffer).toString('base64');
const cases={
 'invalid base64':x=>{x.data[5].y.teamFloat64=x.data[5].y.teamFloat64.slice(0,-4)+'@@@@';},
 'misaligned truncation':x=>{x.data[5].y.teamFloat64=x.data[5].y.teamFloat64.slice(0,-8);},
 'aligned truncation (32 base64 chars = 3 doubles dropped)':x=>{const y=x.data[5].y.teamFloat64;if(y.endsWith('='))throw Error('fixture has padding');x.data[5].y.teamFloat64=y.slice(0,-32);},
 'aligned truncation of 6 doubles to 3':x=>{x.data[5].x={teamRepeat:'S6',n:6};x.data[5].y={teamFloat64:b64([1,2,3,4,5,6]).slice(0,-32)};},
 'n = 0':x=>{x.data[5].x.n=0;},
 'n not an integer':x=>{x.data[5].x.n=x.data[5].x.n+0.5;},
 'n not safe':x=>{x.data[5].x.n=2**53;},
 'n as text':x=>{x.data[5].x.n=String(x.data[5].x.n);},
 'missing teamRepeat':x=>{delete x.data[5].x.teamRepeat;},
 'missing n':x=>{delete x.data[5].x.n;},
 'unknown packed field':x=>{x.data[5].y.extra=1;},
 'y packed, x a shorter array':x=>{x.data[5].x=['S6'];},
 'trace not an object':x=>{x.data[5]=null;},
};
for(const [name,damage] of Object.entries(cases)){const v=fresh();damage(v);const before=JSON.stringify(v);
 if(TeamPlotPayload.unpack(v)!==false||JSON.stringify(v)!==before||v.teamPacked!==1)throw Error('damaged payload was modified: '+name);}
// The six-double case decodes when intact (the check above fails only because of the cut).
{const v=fresh();v.data[5].x={teamRepeat:'S6',n:6};v.data[5].y={teamFloat64:b64([1,2,3,4,5,6])};if(!TeamPlotPayload.unpack(v)||v.data[5].y.join()!=='1,2,3,4,5,6'||v.data[5].x.length!==6)throw Error('intact six doubles');}
// Missing marker: nothing is touched.
{const v=fresh();delete v.teamPacked;const before=JSON.stringify(v);if(TeamPlotPayload.unpack(v)!==false||JSON.stringify(v)!==before)throw Error('unmarked payload was modified');}
console.warn=warn;
console.log('JS unpack leaves '+(Object.keys(cases).length+1)+' damaged/unmarked payloads untouched');
