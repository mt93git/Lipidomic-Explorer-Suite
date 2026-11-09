import {expect,it} from 'vitest';
import {isComputedId,computedOf,validateComputed,setNexoComputed,computedResends,carryComputed,shapeChoices,shapeGlyph,isCheckboxGroup,plotlySymbols} from './computed';
import {validateNexo} from './nexo';
import {createStore} from './store';
import {createHistory} from './history';
import {addNode,removeNodes} from './commands';
const node={kind:'plot' as const,id:'a',label:'A',x:0,y:0,width:400,height:300,visual:{},instance:{instanceId:'i1',source:'qc_pca_tab-boxplotAfterNorm'}};
it('recognises Team module computed ids only',()=>{
 expect(['customCol_Control','customShape_QC pool','bqcSamples'].every(isComputedId)).toBe(true);
 expect(['customCol_','qc_color','bqcSamplesX','__proto__'].some(isComputedId)).toBe(false);
 expect(computedOf({customCol_A:'#112233',other:1,bqcSamples:['s1']})).toEqual({customCol_A:'#112233',bqcSamples:['s1']});
});
// Structural grid (chart audit b08): Team's drawer builds "Log2FC Threshold (abs):" in renderUI
// (R/modules/12_structural_grid_module.R gridLog2fcThreshUI), outside allowedInputs; it filters all four plots.
it('the structural grid Log2FC threshold is a computed control: a finite number >= 0',()=>{
 expect(isComputedId('gridLog2fcThresh')).toBe(true);
 expect(['gridLog2fcThreshX','log2fcThresh'].some(isComputedId)).toBe(false);
 expect(validateComputed({gridLog2fcThresh:0.5})).toEqual({gridLog2fcThresh:0.5});
 expect(validateComputed({gridLog2fcThresh:0})).toEqual({gridLog2fcThresh:0});
 for(const bad of [-1,Number.NaN,Number.POSITIVE_INFINITY,'0.5',null,[1]])expect(validateComputed({gridLog2fcThresh:bad})).toEqual({});
});
it('validates colour, plotly symbol and sample lists',()=>{
 expect(validateComputed({customCol_A:'#11223g',customCol_B:'#aabbcc',customShape_A:'circle',customShape_B:'<script>',bqcSamples:['s1',2,'s2'],x:1})).toEqual({customCol_B:'#aabbcc',customShape_A:'circle',bqcSamples:['s1','s2']});
 expect(validateComputed({bqcSamples:'s1'})).toEqual({});
});
it('one undo step per committed change, merged into the node member, restoring the baseline',()=>{
 const store=createStore({nodes:[node],nexo:validateNexo(null)}),h=createHistory(store);
 h.dispatch(setNexoComputed('a',{customCol_Control:'#ff0000'},{customCol_Control:'#176b73'}));
 h.dispatch(setNexoComputed('a',{bqcSamples:['s1','s2']},{bqcSamples:[]}));
 expect(store.get().nexo.nodes.a.inputs).toEqual({customCol_Control:'#ff0000',bqcSamples:['s1','s2']});
 expect(h.cursor).toBe(2);
 h.undo();expect(store.get().nexo.nodes.a.inputs).toEqual({customCol_Control:'#ff0000',bqcSamples:[]});
 h.undo();expect(store.get().nexo.nodes.a.inputs).toEqual({customCol_Control:'#176b73'});
 h.redo();h.redo();expect(store.get().nexo.nodes.a.inputs?.bqcSamples).toEqual(['s1','s2']);
});
it('deleting the node drops the member; the save payload keeps it for live nodes only',()=>{
 const store=createStore({nodes:[node],nexo:validateNexo(null)}),h=createHistory(store);
 h.dispatch(setNexoComputed('a',{customShape_Control:'diamond'}));
 expect(validateNexo(store.get().nexo,['a']).nodes.a.inputs).toEqual({customShape_Control:'diamond'});
 h.dispatch(removeNodes(['a']));expect(store.get().nexo.nodes.a).toBeUndefined();
 h.undo();expect(store.get().nexo.nodes.a.inputs).toEqual({customShape_Control:'diamond'});
});
it('reopen re-sends one PATCH per Team card that carries computed values',()=>{
 const nexo=validateNexo({version:1,nodes:{a:{inputs:{customCol_Control:'#ff0000',bqcSamples:['s1','s2']}},b:{inputs:{dash:1}}}});
 const nodes=[node,{...node,id:'b',instance:{instanceId:'i2',source:'x'}},{...node,id:'c',instance:{instanceId:'i3',source:'x'}}];
 expect(computedResends(nodes,nexo)).toEqual([{nodeId:'a',instanceId:'i1',inputs:{customCol_Control:'#ff0000',bqcSamples:['s1','s2']}}]);
});
it('a duplicate carries the computed values under its own id',()=>{
 const store=createStore({nodes:[node],nexo:validateNexo(null)}),h=createHistory(store);
 h.dispatch(setNexoComputed('a',{customCol_Control:'#00ff00'}));
 const copy={...node,id:'b'};h.dispatch(addNode(copy));h.dispatch(carryComputed('b',store.get().nexo.nodes.a.inputs));
 expect(store.get().nexo.nodes.b.inputs).toEqual({customCol_Control:'#00ff00'});
 store.set(d=>({...d,nexo:{...d.nexo,nodes:{...d.nexo.nodes,a:{inputs:{customCol_Control:'#000000'}}}}}));
 expect(store.get().nexo.nodes.b.inputs).toEqual({customCol_Control:'#00ff00'});
});
// Team's real API: shapes are ggplot pch numbers with names; BQC samples arrive as lowercase "checkboxgroup".
const pch=[{value:'16',label:'Circle'},{value:'15',label:'Square'},{value:'17',label:'Triangle'},{value:'18',label:'Diamond'},{value:'3',label:'Plus'},{value:'4',label:'Cross'},{value:'8',label:'Star'}];
const teamShape={id:'customShape_Control',type:'select' as const,label:'Shape for Control',options:pch,computed:true};
it('validates a shape against the control\'s own options, plotly names only when it has none',()=>{
 expect(validateComputed({customShape_Control:'16'},[teamShape])).toEqual({customShape_Control:'16'});
 expect(validateComputed({customShape_Control:'circle'},[teamShape])).toEqual({});
 expect(validateComputed({customShape_Control:'99'},[teamShape])).toEqual({});
 const bare={...teamShape,options:undefined};
 expect(validateComputed({customShape_Control:'circle'},[bare])).toEqual({customShape_Control:'circle'});
 expect(validateComputed({customShape_Control:'16'},[bare])).toEqual({});
 // No schema at hand (reopen, paste): plotly names and Team's pch numbers both survive, markup does not.
 expect(validateComputed({customShape_A:'16',customShape_B:'circle',customShape_C:'<b>',customShape_D:'999'})).toEqual({customShape_A:'16',customShape_B:'circle'});
});
it('the shape select offers the control\'s own options, label shown and value sent',()=>{
 expect(shapeChoices(teamShape)).toEqual(pch);
 expect(shapeChoices({...teamShape,options:[]}).map(o=>o.value)).toEqual(plotlySymbols);
 expect(shapeChoices(undefined)[0]).toEqual({value:'circle',label:'circle'});
});
it('maps Team\'s pch numbers and plotly names to a matching preview glyph',()=>{
 expect(['16','15','17','18','3','4','8'].map(shapeGlyph)).toEqual(['●','■','▲','◆','✚','✕','✳']);
 expect(shapeGlyph('triangle-up')).toBe('▲');expect(shapeGlyph('unknown')).toBe('●');
});
it('accepts checkboxgroup and checkboxGroup alike',()=>{
 expect(isCheckboxGroup('checkboxgroup')&&isCheckboxGroup('checkboxGroup')).toBe(true);
 expect(isCheckboxGroup('select')).toBe(false);
});
