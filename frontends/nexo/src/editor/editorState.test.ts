import { expect, it } from 'vitest';
import { reduceEditor, serializeEditor, type EditorState } from './editorState';
import { applyEditor, baselineOf } from './applyEditor';
it('undo/redo across three actions, branching and the 50-step limit',()=>{
  let state: EditorState={};
  for(const value of ['A','B','C'])state=reduceEditor(state,{type:'layout',key:'title.text',value});
  state=reduceEditor(state,{type:'undo'}); expect(state.layout?.['title.text']).toBe('B');
  state=reduceEditor(state,{type:'undo'}); expect(state.layout?.['title.text']).toBe('A');
  state=reduceEditor(state,{type:'undo'}); expect(state.layout?.['title.text']).toBeUndefined();
  for(let i=0;i<3;i++)state=reduceEditor(state,{type:'redo'});
  expect(state.layout?.['title.text']).toBe('C');
  for(let i=0;i<60;i++)state=reduceEditor(state,{type:'layout',key:'font.size',value:6+i});
  expect(state.history?.past).toHaveLength(50);
  state=reduceEditor(reduceEditor(state,{type:'undo'}),{type:'reset'});
  expect(state.history?.future).toHaveLength(0);
});
it('serializes only server keys, valid values and unique trace indices',()=>{
  const out=serializeEditor({unknown:1,layout:{'title.text':'Hi','xaxis.range':[0,2],'font.size':100},traces:[{index:0,name:'A',x:[1],hidden:true},{index:0,name:'duplicate'}],swapAxes:true,palette:'Lab',history:{past:[]}});
  expect(out).toEqual({layout:{'title.text':'Hi'},traces:[{index:0,name:'A'}],swapAxes:true,palette:'Lab'});
  expect(serializeEditor({annotations:Array.from({length:40},()=>({text:'A',x:0,y:0})),traces:Array.from({length:120},(_,index)=>({index}))}).annotations).toHaveLength(30);
  expect(serializeEditor({traces:Array.from({length:120},(_,index)=>({index}))}).traces).toHaveLength(100);
});
it('baseline plus Reset returns the original figure',()=>{
  const figure={data:[{x:[1],y:[2]}],layout:{title:{text:'Original'}}};
  const state=reduceEditor({}, {type:'layout',key:'title.text',value:'New'});
  const out=applyEditor(figure,state);
  expect(applyEditor(baselineOf(out),reduceEditor(state,{type:'reset'}))).toEqual(figure);
});
