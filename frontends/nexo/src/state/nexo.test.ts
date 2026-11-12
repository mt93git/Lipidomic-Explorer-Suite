import {expect,it,vi,afterEach} from 'vitest';
import {validateNexo,setNexoStyle,validateNexoStyle,migrateMarkerSymbols} from './nexo';
import {createStore} from './store';
import {createHistory} from './history';
import {addNode,removeNodes} from './commands';
import {tabsCommand} from '../ui/tabsWiring';
import {initial} from './tabs';
import {copyPlot,clipboard} from '../clipboard';
import {checkpointZip,readCheckpointZip} from '../mock/archive';
import {saveCheckpoint} from '../api';
const node={kind:'plot' as const,id:'a',label:'A',x:0,y:0,width:400,height:300,visual:{}};
afterEach(()=>vi.unstubAllGlobals());
it('coalesces styles, restores deletion, and duplicates without sharing state',()=>{
 const store=createStore({nodes:[node],nexo:validateNexo(null)}),h=createHistory(store);
 h.dispatch(setNexoStyle('a',{yaxis:{type:'log'}}));h.dispatch(setNexoStyle('a',{yaxis:{type:'log',min:1}}));expect(h.cursor).toBe(1);
 const copy={...node,id:'b'};h.dispatch(tabsCommand(initial(['a','b']),[addNode(copy),setNexoStyle('b',store.get().nexo.nodes.a.style!)]));
 h.dispatch(removeNodes(['a']));expect(store.get().nexo.nodes.a).toBeUndefined();h.undo();expect(store.get().nexo.nodes.a.style!.yaxis?.min).toBe(1);h.undo();expect(store.get().nexo.nodes.b).toBeUndefined();h.redo();expect(store.get().nexo.nodes.b.style).toEqual(store.get().nexo.nodes.a.style);
 copyPlot(node,store.get().nexo.nodes.a.style!);expect(clipboard()?.nexoStyle).toEqual({yaxis:{type:'log',min:1}});
});
it('enforces byte limits, drops stale nodes and malformed members',()=>{
 const member={version:1,nodes:{a:{style:{titleWeight:'bold',extra:1}},b:{style:{margin:{l:20}}}}};expect(validateNexo(member,['a'])).toEqual({version:1,nodes:{a:{style:{titleWeight:'bold'}}}});
 expect(validateNexo({version:1,nodes:{},junk:'x'.repeat(2*1024**2)}).nodes).toEqual({});expect(validateNexo({version:2,nodes:member.nodes}).nodes).toEqual({});
 expect(validateNexoStyle({xaxis:{min:5,max:1},margin:{l:1001},legendWeight:'heavy'})).toEqual({});
});
it('writes separate archive members, keeping Team schema clean',async()=>{
 const nexo=validateNexo({version:1,nodes:{a:{style:{margin:{l:20}}}}});const state={version:'1',nodes:[node]};const blob=checkpointZip(state,'Styled',nexo);const file=new File([blob],'test.zip');
 expect(await readCheckpointZip(file)).toEqual(state);expect(await readCheckpointZip(file,'nexo-canvas-v1.json')).toEqual(nexo);
});
it('sends nexo next to canvas in the save payload',async()=>{
 // No Admin on this host: the save goes without a token (nexo-store-scope.md); the stubbed fetch sees only the API.
 (await import('../api/adminToken')).useAdminTokenFetch(async()=>new Response('not found',{status:404}));
 const fetch=vi.fn().mockResolvedValue(new Response('{}',{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);const nexo=validateNexo(null),canvas={token:'save',state:{version:'1',nodes:[]}};
 await saveCheckpoint('session','Styled',canvas,nexo);expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({label:'Styled',canvas,nexo});
});

it('mock checkpoint validation rejects invalid member contracts',async()=>{
 const {assertNexoMember}=await import('./nexo');
 expect(()=>assertNexoMember(null)).toThrow(/object/);expect(()=>assertNexoMember([])).toThrow(/object/);expect(()=>assertNexoMember({version:2})).toThrow(/version/);expect(()=>assertNexoMember({version:1,junk:'x'.repeat(2*1024**2)})).toThrow(/2 MiB/);expect(()=>assertNexoMember({version:1,nodes:{}})).not.toThrow();
});
it('a malformed optional member never prevents reading the Team member',async()=>{
 const file=new File([checkpointZip({nodes:[node]},'',{version:1,nodes:{}})],'test.zip');const bytes=new Uint8Array(await file.arrayBuffer());const marker=new TextEncoder().encode('{"version":1,"nodes":{}}');
 let at=-1;outer:for(let i=0;i<bytes.length-marker.length;i++){for(let j=0;j<marker.length;j++)if(bytes[i+j]!==marker[j])continue outer;at=i;break;}expect(at).toBeGreaterThan(-1);bytes[at]=33;
 const corrupt=new File([bytes],'bad.zip');expect(await readCheckpointZip(corrupt,'nexo-canvas-v1.json')).toBeNull();expect(await readCheckpointZip(corrupt)).toEqual({nodes:[node]});
});

it('sanitizes stretch fields, nested unknown keys, values and collection limits',()=>{
 const valid={type:'rect',x0:1,x1:2,y0:3,y1:4,color:'#abcdef',opacity:.2,width:2,junk:1};
 const style=validateNexoStyle({series:[{index:0,sourceKey:'a',markerSymbol:'diamond',lineDash:'dash',junk:1},{index:-1,markerSymbol:'circle'},{index:1,markerSymbol:'invalid'},{index:2,lineDash:'invalid'}],legendOrder:'reversed',shapes:[valid,{...valid,x0:NaN}],annotations:[{text:'a',x:1,y:2,ax:-20,ay:30,size:12,color:'#abcdef',xref:'paper',showarrow:false},{text:'b',x:Infinity,y:1}]});
 expect(style.series).toEqual([{index:0,sourceKey:'a',lineDash:'dash'}]);expect(style.legendOrder).toBe('reversed');expect(style.shapes).toEqual([{type:'rect',x0:1,x1:2,y0:3,y1:4,color:'#abcdef',opacity:.2,width:2}]);expect(style.annotations).toEqual([{text:'a',x:1,y:2,ax:-20,ay:30,size:12,color:'#abcdef'}]);
 expect(validateNexoStyle({shapes:Array(60).fill(valid)}).shapes).toHaveLength(50);expect(validateNexoStyle({annotations:Array(40).fill({text:'a',x:1,y:1})}).annotations).toHaveLength(30);
});

it('drops unsafe tick formats and accepts numeric and date format strings',()=>{
 expect(validateNexoStyle({xaxis:{tickformat:'999999999999999f'}})).toEqual({});expect(validateNexoStyle({xaxis:{tickformat:'garbage'}})).toEqual({});
 for(const tickformat of ['.2f',',.0f','$,.2f','.1%','~s','%Y-%m-%d','%H:%M:%S'])expect(validateNexoStyle({xaxis:{tickformat}}).xaxis?.tickformat).toBe(tickformat);
});
it('keeps the inputs of a fixed dashboard card in the Nexo member, with undo, never in Team\'s node',async()=>{
 const {setNexoInputs}=await import('./nexo');const {validateState}=await import('./validate');
 const fixed={kind:'plot' as const,id:'results_dashboard-plot_violin',label:'Violin',x:0,y:0,width:620,height:720,visual:{}};
 const store=createStore({nodes:[fixed],nexo:validateNexo(null)}),h=createHistory(store);
 h.dispatch(setNexoStyle(fixed.id,{yaxis:{type:'log'}}));
 h.dispatch(setNexoInputs(fixed.id,{color_by:'Group2',top_n:10}));
 expect(store.get().nexo.nodes[fixed.id]).toEqual({style:{yaxis:{type:'log'}},inputs:{color_by:'Group2',top_n:10}});
 h.dispatch(setNexoStyle(fixed.id,{}));expect(store.get().nexo.nodes[fixed.id].inputs).toEqual({color_by:'Group2',top_n:10});
 h.undo();h.undo();expect(store.get().nexo.nodes[fixed.id]).toEqual({style:{yaxis:{type:'log'}}});
 h.redo();expect(store.get().nexo.nodes[fixed.id].inputs?.color_by).toBe('Group2');
 expect((store.get().nodes[0] as {instance?:unknown}).instance).toBeUndefined();
 expect(validateState({version:'1',libraryHidden:false,nodes:store.get().nodes}).ok).toBe(true);
 const round=validateNexo(JSON.parse(JSON.stringify(store.get().nexo)),[fixed.id]);expect(round.nodes[fixed.id].inputs).toEqual({color_by:'Group2',top_n:10});
 expect(validateNexo({version:1,nodes:{a:{inputs:[1]}}}).nodes.a).toBeUndefined();
 expect(validateNexo({version:1,nodes:{a:{inputs:Object.fromEntries(Array.from({length:251},(_,i)=>['k'+i,i]))}}}).nodes.a).toBeUndefined();
});

// NEXO-P3: one marker shape control, Team's. Nexo's own "Series style → Marker symbol" (nexo series markerSymbol) moves on
// load to Team's saved field (visual.editor.traces markerSymbol); shapes Team does not offer are dropped.
it('Nexo\'s own marker symbol moves to Team\'s markerSymbol on load; Team\'s own choice wins; other shapes are dropped',()=>{
 const nodes=[{id:'a',visual:{editor:{traces:[{index:0,sourceKey:'k0',color:'#123456'}]}}},{id:'b',visual:{}},{id:'c',visual:{editor:{traces:[{index:0,markerSymbol:'square'}]}}},{id:'d',visual:{}}];
 const nexo={version:1,nodes:{a:{style:{series:[{index:0,sourceKey:'k0',markerSymbol:'diamond'},{index:1,sourceKey:'k1',markerSymbol:'cross',lineDash:'dash'}]}},b:{style:{series:[{index:2,markerSymbol:'star'}]}},c:{style:{series:[{index:0,markerSymbol:'triangle-up'}]}}}};
 const before=JSON.stringify(nodes),moved=migrateMarkerSymbols(nodes,nexo) as any[];
 expect(moved[0].visual.editor.traces).toEqual([{index:0,sourceKey:'k0',color:'#123456',markerSymbol:'diamond'}]);
 expect(moved[1].visual.editor).toEqual({traces:[{index:2,markerSymbol:'star'}]});
 expect(moved[2].visual.editor.traces).toEqual([{index:0,markerSymbol:'square'}]);
 expect(moved[3]).toBe(nodes[3]);expect(JSON.stringify(nodes)).toBe(before);
 // Nexo keeps no marker symbol of its own; a line dash stays.
 expect(validateNexo(nexo).nodes).toEqual({a:{style:{series:[{index:1,sourceKey:'k1',lineDash:'dash'}]}}});
});
