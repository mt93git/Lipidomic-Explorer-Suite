// Unit tests (no server): canvas tabs state model, migration and operations.
const assert=require('node:assert/strict');
const M=require('../../www/team/js/canvas_tabs_model.js');
const ids=['plot_a','plot_b','plot_c'];
// Old checkpoint (no field) -> one default tab "Canvas 1" holding every card in order; saves stay classic.
let s=M.validate(undefined,ids);
assert.deepEqual(s.tabs,[{id:'tab-1',name:'Canvas 1',nodes:ids}]);assert.equal(s.active,'tab-1');
assert.equal(M.serialize(s,ids),null,'a default single tab writes no field');
// Unknown version / malformed -> fallback, never an error.
for(const bad of [{version:'2',tabs:[]},{version:'1',tabs:'x'},{version:'1',tabs:[{id:'nope',name:'A',nodes:[]}]},{version:'1',tabs:[{id:'tab-1',name:'   ',nodes:[]}]},[],'x',42])
 assert.deepEqual(M.validate(bad,ids).tabs,[{id:'tab-1',name:'Canvas 1',nodes:ids}]);
// Operations.
s=M.initial(ids);
let r=M.addTab(s);assert.ok(r.ok);assert.equal(s.active,r.id);assert.equal(M.tabOf(s,r.id).name,'Canvas 2');
r=M.addTab(s,'  Results   ');assert.equal(M.tabOf(s,r.id).name,'Results');const t3=r.id;
assert.equal(M.rename(s,t3,'x'.repeat(60)).name.length,40,'names are trimmed to 40 characters');
r=M.rename(s,t3,'Canvas 2');assert.ok(r.ok&&r.duplicate,'duplicate names are allowed with a warning');
assert.equal(M.rename(s,t3,'  ').ok,false,'empty names are refused');
M.rename(s,t3,'Results');
assert.ok(M.moveNode(s,'plot_b',t3));assert.deepEqual(M.tabOf(s,'tab-1').nodes,['plot_a','plot_c']);assert.deepEqual(M.tabOf(s,t3).nodes,['plot_b']);
assert.equal(M.tabForNode(s,'plot_b'),t3);assert.equal(M.moveNode(s,'plot_b',t3),false);
assert.ok(M.reorder(s,t3,0));assert.deepEqual(s.tabs.map(t=>t.name),['Results','Canvas 1','Canvas 2']);
// New cards join the active tab; copies are assigned to their destination.
M.setActive(s,'tab-1');assert.ok(M.assign(s,'plot_d'));assert.deepEqual(M.tabOf(s,'tab-1').nodes,['plot_a','plot_c','plot_d']);
assert.ok(M.assign(s,'plot_e',t3));assert.equal(M.assign(s,'plot_e','tab-1'),false,'a card belongs to one tab');
const all=['plot_a','plot_b','plot_c','plot_d','plot_e'];
// Duplicate: a new empty tab after the source, with the source's cards listed for copying.
r=M.duplicateTab(s,t3);assert.ok(r.ok);assert.deepEqual(r.sources,['plot_b','plot_e']);assert.equal(M.tabOf(s,r.id).name,'Results copy');assert.equal(s.tabs[1].id,r.id);
const dup=r.id;
// Delete: move cards elsewhere, or delete them.
r=M.deleteTab(s,t3,'tab-1');assert.ok(r.ok);assert.deepEqual(r.removed,[]);assert.deepEqual(M.tabOf(s,'tab-1').nodes,['plot_a','plot_c','plot_d','plot_b','plot_e']);
M.moveNode(s,'plot_e',dup);r=M.deleteTab(s,dup,null);assert.deepEqual(r.removed,['plot_e']);
assert.equal(M.deleteTab(M.initial(ids),'tab-1').ok,false,'the last tab cannot be deleted');
// Figure page: tab order then card order; custom order; selection per card and per tab.
s=M.initial(ids);r=M.addTab(s,'Second');M.moveNode(s,'plot_a',r.id);
assert.deepEqual(M.figureOrder(s),['plot_b','plot_c','plot_a']);
M.reorder(s,r.id,0);assert.deepEqual(M.figureOrder(s),['plot_a','plot_b','plot_c']);
assert.ok(M.moveInOrder(s,'plot_c',-2));assert.deepEqual(M.figureOrder(s),['plot_c','plot_a','plot_b']);
assert.ok(M.setIncluded(s,'plot_b',false));assert.equal(M.included(s,'plot_b'),false);
assert.ok(M.setTabIncluded(s,r.id,false));assert.equal(M.included(s,'plot_a'),false);M.setTabIncluded(s,r.id,true);assert.equal(M.included(s,'plot_a'),true);
// Round trip through JSON and validation keeps everything; removed cards are pruned.
const saved=JSON.parse(JSON.stringify(M.serialize(s,ids)));
assert.deepEqual(M.validate(saved,ids),M.prune(s,ids));
const pruned=M.validate(saved,['plot_a','plot_c','plot_new']);
assert.deepEqual(pruned.tabs.map(t=>t.nodes),[['plot_a','plot_new'],['plot_c']],'unknown cards join the first tab, removed ones are dropped');
assert.deepEqual(pruned.figure,{deselected:[],order:['plot_c','plot_a']});
// Hostile input stays inert.
const evil=M.validate({version:'1',active:'tab-9',tabs:[{id:'tab-1',name:'<img src=x onerror=1>\u0007',nodes:['plot_a','plot_a','__proto__']},{id:'tab-1',name:'dup',nodes:[]}]},ids);
assert.deepEqual(evil.tabs,[{id:'tab-1',name:'Canvas 1',nodes:ids}],'duplicate tab ids fall back');
const ok=M.validate({version:'1',active:'tab-9',tabs:[{id:'tab-1',name:'<b>x</b>\u0007',nodes:['plot_a','plot_a','__proto__']}]},ids);
assert.equal(ok.tabs[0].name,'<b>x</b>');assert.equal(ok.active,'tab-1');assert.deepEqual(ok.tabs[0].nodes,['plot_a','plot_b','plot_c']);
// Names are cut by characters, never inside an emoji (no lone surrogate).
const astral=M.cleanName('\u{1F9EA}'.repeat(45));assert.equal(Array.from(astral).length,40);assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(astral));
// Default order inside a tab follows the canvas's own card order (newest first), so a default
// workspace keeps the same figure order after a save (no tabs field) and reopen.
{const t=M.initial([]);M.assign(t,'plot_old');M.assign(t,'plot_new');const canon=['plot_new','plot_old'];
 assert.deepEqual(M.figureOrder(t,canon),canon);assert.deepEqual(M.figureOrder(M.validate(M.serialize(t,canon),canon),canon),canon);assert.equal(M.serialize(t,canon),null);
 // Cards that leave the board leave the tab, selection and order; unowned cards are adopted.
 M.setIncluded(t,'plot_old',false);M.moveInOrder(t,'plot_old',-1,canon);assert.equal(M.forget(t,'plot_old'),true);
 assert.deepEqual(t.tabs[0].nodes,['plot_new']);assert.deepEqual(t.figure,{deselected:[],order:['plot_new']});
 M.addTab(t,'B');assert.equal(M.adopt(t,['plot_new','plot_kept'],t.active),true);assert.deepEqual(t.tabs.map(x=>x.nodes),[['plot_new'],['plot_kept']]);}
console.log('PASS canvas tabs model: migration, fallback, add/rename/reorder/duplicate/delete, move/copy assignment, figure order/selection, round trip');
