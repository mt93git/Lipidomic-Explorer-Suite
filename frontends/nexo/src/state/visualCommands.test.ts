import {expect,it} from 'vitest';
import {setAppearance} from './visualCommands';
it('restores appearance and strips unsupported editor keys',()=>{
 const doc={nodes:[{id:'a',label:'A',x:0,y:0,width:100,height:100,visual:{background:'#ffffff'}}]};
 const command=setAppearance('a',{visual:{background:'#123456',editor:{layout:{'font.size':14,unsafe:true} as never}}});
 const next=command.apply(doc);
 expect(next.nodes[0].visual).toEqual({background:'#123456',editor:{layout:{'font.size':14},traces:[]}});
 expect(command.invert(doc).apply(next).nodes[0].visual).toEqual(doc.nodes[0].visual);
 expect(doc.nodes[0].visual.background).toBe('#ffffff');
});
it('one undo restores a node that had no colour or visual exactly (no undefined keys left behind)',()=>{
 const doc={nodes:[{id:'h',label:'Heat',x:0,y:0,width:100,height:100}]};
 const command=setAppearance('h',{visual:{editor:{traces:[{index:0,scaleLow:'#440154',scaleMid:'#21918c',scaleHigh:'#fde725'}]} as never}});
 const restored=command.invert(doc).apply(command.apply(doc));
 expect(restored.nodes[0]).toStrictEqual(doc.nodes[0]);
 expect(Object.keys(restored.nodes[0])).toEqual(Object.keys(doc.nodes[0]));
});
