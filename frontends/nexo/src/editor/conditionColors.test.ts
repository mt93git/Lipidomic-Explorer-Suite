import {expect,it} from 'vitest';
import {conditionColorPatches} from './conditionColors';
import {applyEditor} from './applyEditor';
it('recolours every scalar series in a study condition, preserving per-point colours and other conditions',()=>{
 const figure={layout:{meta:{teamConditions:['Control','Treated']}},data:[
 {type:'scatter',name:'a',meta:{teamCondition:'Control'},x:[1],y:[2],marker:{color:'#111111'}},
 {type:'bar',name:'b',meta:{teamCondition:'Control'},x:[1],y:[2],marker:{color:'#111111'}},
 {type:'scatter',name:'c',meta:{teamCondition:'Control'},x:[1],y:[2],marker:{color:['red']}},
 {type:'scatter',name:'d',meta:{teamCondition:'Treated'},x:[1],y:[2],marker:{color:'#111111'}}]};
 const patches=conditionColorPatches(figure,'Control','#abcdef');
 const out=applyEditor(figure,{traces:patches});
 expect(out.data.slice(0,2).map(t=>t.marker.color)).toEqual(['#abcdef','rgba(171,205,239,1)']);
 expect(out.data[2].marker.color).toEqual(['red']);expect(out.data[3].marker.color).toBe('#111111');
 expect(out.data.map(t=>[t.x,t.y])).toEqual(figure.data.map(t=>[t.x,t.y]));
});
