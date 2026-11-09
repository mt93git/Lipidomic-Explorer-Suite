import {expect,it} from 'vitest';
import {schemaFor,mockComputedLabel} from './schema';
// The mock matches what the real API serves (frontends/nexo-api/schema.R, measured on the synthetic fixture). Pilot F1: the
// per-group pickers live where they reach a canvas copy's plot (the cellular polar map); a QC copy offers none.
it('serves Team\'s pch shape options and a lowercase checkboxgroup',()=>{
 const shape=schemaFor('cellular_org_tab-polarPlot').controls.find(c=>c.id==='customShape_Control');
 expect(shape?.options).toEqual([{value:'16',label:'Circle'},{value:'15',label:'Square'},{value:'17',label:'Triangle'},{value:'18',label:'Diamond'},{value:'3',label:'Plus'},{value:'4',label:'Cross'},{value:'8',label:'Star'}]);
 expect(shape?.default).toBe('16');
 const bqc=schemaFor('qc_pca_tab-bqcPlot').controls.find(c=>c.id==='bqcSamples');
 expect(bqc?.type).toBe('checkboxgroup');
});
it('the mock render label names the first group\'s shape',()=>{
 expect(mockComputedLabel('cellular_org_tab-polarPlot','Polar',{customCol_Control:'#112233',customShape_Control:'17'}).label).toBe('Polar · #112233 Triangle');
 expect(mockComputedLabel('cellular_org_tab-polarPlot','Polar',{}).label).toBe('Polar · #176b73 Circle');
});
it('pilot F1: QC copies offer no per-group pickers and say their colours follow the session palette; the 2D PCA draws the session colour',()=>{
 for(const source of ['qc_pca_tab-boxplotAfterNorm','qc_pca_tab-pca2dPlot']){const schema=schemaFor(source,undefined,{useCustomColors:true});
  expect(schema.controls.some(c=>/^custom(Col|Shape)_/.test(c.id))).toBe(false);expect(schema.sessionPalette).toBe(true);}
 expect(schemaFor('cellular_org_tab-polarPlot').sessionPalette).toBe(true);
 expect(schemaFor('volcano_tab-volcanoPlot').sessionPalette).toBeUndefined();
 expect(mockComputedLabel('qc_pca_tab-pca2dPlot','PCA',{useCustomColors:true,customCol_Control:'#112233'})).toEqual({label:'PCA'});
 expect(mockComputedLabel('qc_pca_tab-pca2dPlot','PCA',{},undefined,'#AA3300')).toEqual({label:'PCA · #AA3300',fill:'#AA3300'});
});
