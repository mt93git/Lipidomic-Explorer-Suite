import {it,expect} from 'vitest';
import {size,model,hiddenByLayout,leftOutByLayout} from './layout';
import {strings as s,phrases as p} from '../ui/strings';
import {initialDocument} from './model';
it('uses exact Team paper sizes and orientations',()=>{expect(size({...initialDocument(),paper:'a4',paperWidth:null,paperHeight:null,orientation:'landscape'})).toEqual([841.89,595.28]);expect(size(initialDocument())).toEqual([612,792]);});
it('one plot per page uses Team margins',()=>{const d={...initialDocument(),layout:'pages' as const};expect(model(d,[{id:'plot',kind:'plot',label:'Plot',x:0,y:0,width:300,height:300}])[0].items[0]).toMatchObject({x:46,y:66,width:520,height:674});});
it('figure1 keeps Team draft legend and PCA caption',()=>{const p=model({...initialDocument(),layout:'figure1'},[{id:'results_dashboard-plot_pca',kind:'plot',label:'Principal components',x:0,y:0,width:300,height:300}])[0];expect(p.items[1].caption).toBe('B / PCA · Principal components');expect(p.legend).toBe('DRAFT · A: illustration pending. C: class Log2FC and model pending. D: targets, scale and sn-position evidence pending.');});
it('arrangement preserves relative canvas geometry',()=>{const nodes=[{id:'a',kind:'plot' as const,label:'a',x:40,y:80,width:300,height:300},{id:'b',kind:'plot' as const,label:'b',x:640,y:80,width:300,height:300}];const p=model({...initialDocument(),layout:'arrangement'},nodes)[0];expect(p.items[0]).toMatchObject({x:46,y:66});expect(p.items[0].width).toBeCloseTo(300*520/900);expect(p.items[1].x).toBeCloseTo(46+600*520/900);});
// Pilot simulation, step 9: Paula added "PCA scores · 2D" from the library (a tcinstance_… copy) and finished it, yet
// panel B said "Finish a 2D PCA in Draft": the template only knew the two fixed ids. A copy of the same source fills B
// when neither fixed card is on the canvas; the dashboard PCA still wins when present.
it('figure1 panel B takes a library copy of the 2D PCA when no fixed PCA card exists',()=>{
 const copy={id:'tcinstance_abc-pca2dPlot',kind:'plot' as const,label:'PCA scores · 2D',x:0,y:0,width:300,height:300,instance:{instanceId:'tcinstance_abc',source:'qc_pca_tab-pca2dPlot'}};
 const dashboard={id:'results_dashboard-plot_pca',kind:'plot' as const,label:'Principal components',x:0,y:0,width:300,height:300};
 const panelB=(nodes:typeof copy[]|typeof dashboard[]|(typeof copy|typeof dashboard)[])=>model({...initialDocument(),layout:'figure1'},nodes)[0].items.find(i=>i.caption?.startsWith('B / PCA'))!;
 expect(panelB([copy]).node?.id).toBe('tcinstance_abc-pca2dPlot');
 expect(panelB([copy]).caption).toBe('B / PCA · PCA scores · 2D');
 expect(panelB([copy,dashboard]).node?.id).toBe('results_dashboard-plot_pca');
 expect(panelB([]).node).toBeUndefined();
});
// Pilot simulation step 9: the Figure 1 template hid Paula's text without a word. Templates show their own panels;
// free text and shapes are kept and show on the Free layout, so the page says how many it hides.
it('counts the text and shapes a template layout hides',()=>{
 const items=[{id:'t',type:'text',x:0,y:0,width:10,height:10,z:0,text:'Figure 1'},{id:'s',type:'shape',shape:'arrow',x:0,y:0,width:10,height:10,z:1},{id:'f',type:'figure',nodeId:'n',x:0,y:0,width:10,height:10,z:2}] as never;
 expect(hiddenByLayout({...initialDocument(),layout:'free',items})).toBe(0);
 for(const layout of ['figure1','pages','arrangement'] as const)expect(hiddenByLayout({...initialDocument(),layout,items})).toBe(2);
 expect(hiddenByLayout({...initialDocument(),layout:'figure1',items:[]})).toBe(0);
});
// Steph review step 9: the finished violin and volcano had no slot in the Figure 1 layout and vanished without a word
// (the notice counted texts and shapes only). The page now names the finished plots the layout leaves out.
it('names the finished plots a template layout leaves out',()=>{
 const plot=(id:string,label:string,finished=true,source?:string)=>({id,kind:'plot' as const,label,x:0,y:0,width:300,height:300,...(finished?{finished:{url:'data:image/png;base64,AA',createdAt:'2026-11-08T00:00:00Z'}}:{}),...(source?{instance:{instanceId:id,source}}:{})});
 const pca=plot('tcinstance_a-pca2dPlot','PCA scores · 2D',true,'qc_pca_tab-pca2dPlot'),violin=plot('tcinstance_b-plot_violin','Violin'),volcano=plot('tcinstance_c-volcano','Volcano'),draft=plot('tcinstance_d-comp','Composition',false);
 const art={id:'vial',kind:'illustration' as const,label:'Serum vial',x:0,y:0,width:100,height:100,finished:{url:'data:image/png;base64,AA',createdAt:'2026-11-08T00:00:00Z'}};
 const nodes=[art,pca,violin,volcano,draft] as never[];
 const items=nodes.map((n:{id:string},z)=>({id:`figure-${n.id}`,type:'figure',nodeId:n.id,x:0,y:0,width:10,height:10,z})) as never;
 const doc=(layout:'free'|'pages'|'arrangement'|'figure1')=>({...initialDocument(),layout,items});
 expect(leftOutByLayout(doc('figure1'),nodes).map(n=>n.label)).toEqual(['Violin','Volcano']);
 for(const layout of ['free','pages','arrangement'] as const)expect(leftOutByLayout(doc(layout),nodes)).toEqual([]);
 // A plot unticked in the Plots column is the author's choice, not the layout's: not counted.
 expect(leftOutByLayout({...doc('figure1'),items:(items as {nodeId:string}[]).filter(i=>i.nodeId!==volcano.id)} as never,nodes).map(n=>n.label)).toEqual(['Violin']);
 expect(p.leftOutByLayout(['Violin','Volcano'])).toBe('2 finished plots are not on this layout: Violin, Volcano. Free shows them.');
 expect(p.leftOutByLayout(['Violin'])).toBe('1 finished plot is not on this layout: Violin. Free shows it.');
 expect(s.notOnLayout).toBe('not on this layout');
});
