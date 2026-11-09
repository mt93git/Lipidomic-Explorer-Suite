import { describe, expect, it } from 'vitest';
import { filterOptions, toggleOptions, optionClasses, isLongPicker } from './pickerFilter';
const options = [
  {value:'pc1',label:'PC(16:0/18:1)',class:'PC'},
  {value:'pe1',label:'PE(18:0/20:4)',class:'PE'},
  {value:'pc2',label:'PC(18:0/18:2)',class:'PC'},
];
describe('searchable picker', () => {
  it('matches labels, values and classes without case or surrounding space', () => {
    expect(filterOptions(options, ' pc ')).toEqual([options[0],options[2]]);
    expect(filterOptions(options, '20:4')).toEqual([options[1]]);
    expect(filterOptions(options, 'PE1')).toEqual([options[1]]);
    expect(filterOptions(options, 'missing')).toEqual([]);
    expect(filterOptions(options, '')).toEqual(options);
    expect(filterOptions([{value:'x',label:'Species',class:'Cer'}], 'cer')).toHaveLength(1);
  });
  it('toggles whole classes while preserving other selections and their order', () => {
    expect(optionClasses(options)).toEqual(['PC','PE']);
    expect(toggleOptions(['pe1'], ['pc1','pc2'])).toEqual(['pe1','pc1','pc2']);
    expect(toggleOptions(['pe1','pc1','pc2'], ['pc1','pc2'])).toEqual(['pe1']);
    expect(toggleOptions(['pc1'], ['pc1','pc2'])).toEqual(['pc1','pc2']);
  });
  it('only enhances long choice controls', () => {
    expect(isLongPicker({type:'select',options:Array(12).fill(options[0])})).toBe(false);
    for (const type of ['select','multiselect','checkboxgroup','text'])
      expect(isLongPicker({type,options:Array(13).fill(options[0])})).toBe(true);
    expect(isLongPicker({type:'radio',options:Array(13).fill(options[0])})).toBe(false);
  });
});
