// missing-controls-a: Team controls the Data tab lacked (chart audit b07 F4, b09 FLA index picker).
import {expect, it} from 'vitest';
import {isComputedId, validateComputed, computedResends, carryComputed} from '../../state/computed';
import {addedControlValues} from './actions';
import {groupTitle} from './schemaForm';
import {indexPickers} from '../Inspector/ComputedControls';
import type {CardSchema, SchemaControl} from '../../api';

it('FLA sel_<category> pickers are computed: kept in Nexo member, re-sent on reopen, carried on duplicate', () => {
  expect(isComputedId('sel_Structural')).toBe(true);
  expect(isComputedId('sel_Membrane Architecture')).toBe(true);
  expect(isComputedId('sel_')).toBe(false);
  expect(isComputedId('selectedDetails')).toBe(false);
  const member = {'sel_Structural': ['PE/PC_Index'], 'sel_Energy': [], selectedDetails: ['PC | x']};
  expect(validateComputed(member)).toEqual({'sel_Structural': ['PE/PC_Index'], 'sel_Energy': []});
  const nodes = [{id: 'n1', kind: 'plot', label: '', x: 0, y: 0, width: 1, height: 1, instance: {instanceId: 'tcinstance_a', source: 'fla_tab-logratioPlot'}}] as never;
  expect(computedResends(nodes, {nodes: {n1: {inputs: member}}} as never)).toEqual([{nodeId: 'n1', instanceId: 'tcinstance_a', inputs: {'sel_Structural': ['PE/PC_Index'], 'sel_Energy': []}}]);
  let doc = {nexo: {nodes: {}}} as never as {nexo: {nodes: Record<string, {inputs?: unknown}>}};
  doc = carryComputed('copy', member).apply(doc as never) as never;
  expect(doc.nexo.nodes.copy.inputs).toEqual({'sel_Structural': ['PE/PC_Index'], 'sel_Energy': []});
});

it('a module action that builds new controls (Select Shifts to Visualize) gives them their initial value', () => {
  const schema = {actions: ['runAnalysis'], tabs: {}, controls: [
    {id: 'labelTop', type: 'range', label: 'Label Top % Extremes:', value: 5},
    {id: 'selectedDetails', type: 'multiselect', label: 'Select Shifts to Visualize:', multiple: true, default: ['PC | a', 'PE | b'], value: ['PC | a', 'PE | b'],
      options: [{value: 'PC | a', label: 'PC | a'}, {value: 'PE | b', label: 'PE | b'}, {value: 'TG | c', label: 'TG | c'}]},
  ]} as CardSchema;
  expect(addedControlValues(schema, {labelTop: 7})).toEqual({selectedDetails: ['PC | a', 'PE | b']});
  expect(addedControlValues(schema, {labelTop: 7, selectedDetails: ['TG | c']})).toEqual({});
});

it('a group heading is Team\'s tab title, else a humanised raw id; real titles stay', () => {
  const c = (group: string, groupLabel?: string) => ({id: 'x', type: 'select', label: 'X', group, groupLabel}) as SchemaControl;
  expect(groupTitle('differential_view', [c('differential_view', 'Differential Acyl Chain Expression')])).toBe('Differential Acyl Chain Expression');
  expect(groupTitle('differential_view', [c('differential_view')])).toBe('Differential view');
  expect(groupTitle('Violin Plots', [c('Violin Plots')])).toBe('Violin Plots');
  expect(groupTitle('', [])).toBe('');
});

it('index pickers are the computed checkbox groups other than BQC samples', () => {
  const controls = [
    {id: 'sel_Structural', type: 'checkboxgroup', label: 'Structural', computed: true, options: [{value: 'PE/PC_Index', label: 'PE/PC'}]},
    {id: 'bqcSamples', type: 'checkboxgroup', label: 'BQC', computed: true, options: []},
    {id: 'customCol_A', type: 'color', label: 'A', computed: true},
  ] as SchemaControl[];
  expect(indexPickers(controls).map((c: SchemaControl) => c.id)).toEqual(['sel_Structural']);
});
