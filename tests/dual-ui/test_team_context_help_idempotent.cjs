const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync('www/team/js/context_help.js','utf8');const fn=code.slice(code.indexOf('  function migrateHelp()'),code.indexOf('  function mount()'));
let inserted=[],title='';const node={tagName:'BUTTON',textContent:'Scientific insight',closest:()=>null,hasAttribute:()=>false,getAttribute:k=>k==='title'?title:null,removeAttribute:()=>{title=''},matches:()=>true,insertAdjacentElement:(where,trigger)=>{trigger.previousElementSibling=node;inserted.push(trigger)}};
const ctx={document:{querySelectorAll:s=>s.startsWith('bslib-tooltip')?[]:[node]},migratedTitles:new WeakMap(),content:{topics:{}},serial:0,helpButton:(key)=>({dataset:{helpTopic:key},setAttribute(){},previousElementSibling:null}),Array};vm.createContext(ctx);vm.runInContext(fn,ctx);
for(let i=0;i<30;i++){title='Literature research is not yet connected to independent plot settings.';ctx.migrateHelp();}
assert.equal(inserted.length,1,'same insight button receives only one help trigger across rerenders');assert.equal(Object.keys(ctx.content.topics).length,1);assert.equal(title,'');
console.log('PASS repeated restored insight titles reuse one help trigger');
