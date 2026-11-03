// Offline check: every Canvas catalog chart has its own reviewed "Explain this chart"
// entry (not only category text), with sources; actions use the allowed vocabulary;
// and the JSON/CSV exports match the data file.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..','..');
function load(file){const window={};new Function('window',fs.readFileSync(path.join(root,file),'utf8'))(window);return window;}
const G=load('www/team/js/companion_guidance_data.js').LipidomicCompanionGuidance;
const catalog=load('www/team/js/canvas_catalog.js').TeamCanvasCatalog.list;
assert.equal(catalog.length,59,'catalog size changed: update the companion guidance');
const actions=/^(publication|palette|datasettings|stats|figure|style:.+|data:-[A-Za-z0-9_]+)$/;
for(const e of catalog){const c=G.charts[e.id];assert.ok(c,'no guidance for '+e.id);
 for(const k of ['what','read'])assert.ok(typeof c[k]==='string'&&c[k].length>=30,e.id+': '+k+' too short');
 assert.ok(Array.isArray(c.caveats)&&c.caveats.length>=1,e.id+': no caveats');
 assert.ok(G.categories[c.cat],e.id+': unknown category '+c.cat);assert.notEqual(c.what,G.categories[c.cat].explain,e.id+': only category text');
 assert.ok(['descriptive','inferential','mixed','navigation'].includes(c.kind),e.id+': kind');
 assert.ok(Array.isArray(c.src)&&c.src.length&&c.src.every(s=>/^[\w./-]+\.(R|js):[\d,-]+$/.test(s)),e.id+': sources');
 (c.tips||[]).forEach(t=>assert.match(t.action||'publication',actions,e.id+': action '+t.action));}
assert.deepEqual(Object.keys(G.charts).filter(id=>!catalog.some(e=>e.id===id)),[],'guidance for charts not in the catalog');
const texts=catalog.map(e=>G.charts[e.id].what);assert.equal(new Set(texts).size,texts.length,'duplicate chart explanations');
G.topics.forEach(t=>{assert.ok(t.id&&t.title&&t.k&&t.text.length>=40,'topic '+t.id);});
assert.equal(new Set(G.topics.map(t=>t.id)).size,G.topics.length,'duplicate topic ids');
Object.values(G.tips).flat().forEach(t=>assert.ok(t.id&&t.text,'tip'));
// Reviewed text never claims a network model or an action it cannot take.
const all=JSON.stringify([G.charts,G.categories,G.common,G.tips,G.topics.map(t=>t.text),G.fallback]);assert.ok(!/openai|gpt|fetch\(|https?:\/\//i.test(all),'guidance mentions a network/model');
console.log('PASS 59 catalog charts have specific reviewed guidance;',G.topics.length,'help topics');
execFileSync(process.execPath,[path.join(__dirname,'export_companion_guidance.cjs'),'--check'],{stdio:'inherit'});
