import {it,expect,test} from 'vitest';
import {initialDocument,constrain,nextZ,freeTextSlot,roundTrip,replaceItem} from './model';
import {validateDocument} from '../state/validate';
it('round trips a v1 document through validation',()=>{const d=initialDocument();expect(roundTrip(d,[])).toEqual(d);expect(validateDocument(d,[]).ok).toBe(true);});
it('clamps geometry, finds free space and caps z',()=>{expect(constrain({x:900,y:-1,width:220,height:50},initialDocument())).toEqual({x:392,y:0,width:220,height:50});expect(nextZ([{z:10000}])).toBe(10000);expect(freeTextSlot([],612,792)).toEqual([46,46]);});
import {syncDocument} from './model';
import {setDocument} from '../state/commands';
it('placement expands paper and survives validation and undo',()=>{const nodes=Array.from({length:12},(_,i)=>({id:`plot${i}`,label:`Plot ${i}`}));const d=syncDocument(initialDocument(),nodes);expect(d.items).toHaveLength(12);expect(validateDocument(d,nodes.map(n=>({...n,x:0,y:0,width:300,height:300}))).ok).toBe(true);const state={nodes:[],document:initialDocument()};const command=setDocument(d);expect(command.invert(state).apply(command.apply(state)).document).toEqual(initialDocument());});
it('round trips figure, text and shape items and clamps after paper changes',()=>{
 const d=syncDocument(initialDocument(),[{id:'plot',label:'Synthetic'}]);
 d.items.push({id:'title',type:'text',text:'Synthetic title',fontSize:16,color:'#172d4b',x:300,y:700,width:220,height:50,z:2},{id:'arrow',type:'shape',shape:'arrow',fill:'none',stroke:'#315c89',strokeWidth:2,x:40,y:400,width:160,height:80,z:3});
 expect(roundTrip(d,['plot'])).toEqual(d);
 const {paperWidth:_,paperHeight:__,...settings}=d;const landscape={...settings,paper:'a4' as const,orientation:'landscape' as const};landscape.items=landscape.items.map(i=>constrain(i,landscape));
 expect(roundTrip(landscape,['plot'])).toEqual(landscape);expect(landscape.items.every(i=>i.x+i.width<=841.89&&i.y+i.height<=595.28)).toBe(true);
});
test('replaceItem keeps only document fields (a dragged page item carries layout decorations)',()=>{
 const doc={version:'1' as const,layout:'free' as const,paper:'letter' as const,orientation:'portrait' as const,items:[{id:'text-1',type:'text' as const,x:46,y:46,width:220,height:50,z:1,text:'Title',fontSize:16,color:'#172d4b'}]};
 const dragged={...doc.items[0],x:80,node:undefined,index:0,note:'x'} as unknown as import('../state/document').DocumentItem;
 const next=replaceItem(doc,dragged);
 expect(Object.keys(next.items[0]).sort()).toEqual(['color','fontSize','height','id','text','type','width','x','y','z']);
 expect(validateDocument(next,[]).ok).toBe(true);
});
import {resizeBox,restack,canRestack,duplicateItem} from './model';
import type {DocumentItem} from '../state/document';
const text=(id:string,z:number):DocumentItem=>({id,type:'text',text:id,fontSize:16,color:'#172d4b',x:40,y:40,width:200,height:100,z});
it('keeps the aspect ratio while locked and frees it when unlocked',()=>{
 expect(resizeBox({width:200,height:100},40,0,true)).toEqual({width:240,height:120});
 expect(resizeBox({width:200,height:100},0,50,true)).toEqual({width:300,height:150});
 expect(resizeBox({width:200,height:100},40,5,false)).toEqual({width:240,height:105});
});
it('brings forward and sends backward one step',()=>{
 const doc={...initialDocument(),items:[text('a',0),text('b',1),text('c',2)]};
 const up=restack(doc,'a',1);expect(up.items.map(i=>[i.id,i.z])).toEqual([['a',1],['b',0],['c',2]]);
 expect(restack(doc,'c',1)).toBe(doc);expect(canRestack(doc,'a',-1)).toBe(false);expect(canRestack(doc,'a',1)).toBe(true);
 expect(restack(up,'a',-1).items.map(i=>[i.id,i.z])).toEqual([['a',0],['b',1],['c',2]]);
 expect(validateDocument(up,[]).ok).toBe(true);
});
it('duplicates an object with a new id on top and respects the 80-object cap',()=>{
 const doc={...initialDocument(),items:[text('a',3)]};const result=duplicateItem(doc,'a','x1')!;
 expect(result.id).toBe('text-x1');expect(result.doc.items[1]).toMatchObject({text:'a',x:56,y:56,z:4});
 expect(validateDocument(result.doc,[]).ok).toBe(true);
 const full={...initialDocument(),items:Array.from({length:80},(_,i)=>text(`t${i}`,i))};expect(duplicateItem(full,'t0')).toBeNull();
});
