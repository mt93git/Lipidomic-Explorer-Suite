const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync('www/team/js/canvas.js','utf8');const f=src.slice(src.indexOf('  function validateGroupComparison('),src.indexOf('  function validateState('));
const ctx={TextEncoder,Set};vm.createContext(ctx);vm.runInContext(f,ctx);
const state={features:['PC'],hiddenConditions:['A'],panelOff:{PC:['B']},panelStyles:{PC:{colors:{A:'#123456'},points:true,box:false,lines:{A:'#654321'}}}};
assert.deepEqual(JSON.parse(JSON.stringify(ctx.validateGroupComparison(state))),state);
for(const bad of [{...state,extra:true},{...state,features:['PC','PC']},{...state,panelStyles:{PC:{colors:{A:'red'},points:true,box:false}}},JSON.parse('{"features":[],"hiddenConditions":[],"panelOff":{"__proto__":[]},"panelStyles":{}}')])assert.throws(()=>ctx.validateGroupComparison(bad));
console.log('PASS independent comparison checkpoint shape, bounded values and unsafe keys');
