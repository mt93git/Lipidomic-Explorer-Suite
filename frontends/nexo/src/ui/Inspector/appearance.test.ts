import {expect,it} from 'vitest';
import {legendGroupsOf,visualPatchFor} from './AppearanceTab';
it('derives groups',()=>expect(legendGroupsOf({data:[{name:'A'},{legendgroup:'B'},{name:'A'}],layout:{}})).toEqual(['A','B']));
it('validates fields',()=>{
expect(visualPatchFor('plot','label','x'.repeat(600))).toEqual({label:'x'.repeat(512)});
expect(visualPatchFor('plot','background','red')).toEqual({});
expect(visualPatchFor('illustration','color','#123456')).toEqual({color:'#123456'});
expect(visualPatchFor('illustration','color','#123')).toEqual({});
expect(visualPatchFor('plot','background','#abcdef')).toEqual({visual:{background:'#abcdef'}});
});
