// Exports the reviewed companion guidance (www/team/js/companion_guidance_data.js)
// as one help entry per Canvas catalog chart: docs/companion/chart_help.{json,csv},
// plus the searchable help topics: docs/companion/help_topics.json.
// Usage: node tests/dual-ui/export_companion_guidance.cjs [--check]
// --check fails if the committed exports differ from the data file.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..','..');
function load(file){const window={};new Function('window',fs.readFileSync(path.join(root,file),'utf8'))(window);return window;}
const G=load('www/team/js/companion_guidance_data.js').LipidomicCompanionGuidance;
const catalog=load('www/team/js/canvas_catalog.js').TeamCanvasCatalog.list;
const rows=catalog.map(e=>{const c=G.charts[e.id]||{};return {id:e.id,title:e.title,category:e.category,kind:c.kind||'',what:c.what||'',read:c.read||'',caveats:(c.caveats||[]).join(' | '),suggestions:(c.tips||[]).map(t=>t.text+(t.action?' ['+t.action+']':'')).join(' | '),sources:(c.src||[]).join(' ; ')};});
const csvCell=v=>/[",\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':String(v);
const cols=Object.keys(rows[0]);
const out={'chart_help.json':JSON.stringify({version:G.version,count:rows.length,charts:rows},null,1)+'\n',
 'chart_help.csv':[cols.join(',')].concat(rows.map(r=>cols.map(k=>csvCell(r[k])).join(','))).join('\n')+'\n',
 'help_topics.json':JSON.stringify({version:G.version,count:G.topics.length,topics:G.topics.map(t=>({id:t.id,title:t.title,keywords:t.k,text:t.text}))},null,1)+'\n'};
const dir=path.join(root,'docs','companion');
if(process.argv.includes('--check')){let bad=Object.keys(out).filter(f=>!fs.existsSync(path.join(dir,f))||fs.readFileSync(path.join(dir,f),'utf8')!==out[f]);if(bad.length){console.error('FAIL stale exports: '+bad.join(', ')+' (run node tests/dual-ui/export_companion_guidance.cjs)');process.exit(1);}console.log('PASS companion guidance exports are current');}
else{fs.mkdirSync(dir,{recursive:true});Object.keys(out).forEach(f=>fs.writeFileSync(path.join(dir,f),out[f]));console.log('wrote',Object.keys(out).map(f=>'docs/companion/'+f).join(', '),rows.length,'charts',G.topics.length,'topics');}
