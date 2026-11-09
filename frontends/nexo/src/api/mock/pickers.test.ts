import { expect, it } from 'vitest';
import { schemaFor } from '../../mock/schema';
import { isLongPicker, optionClasses } from '../../ui/forms/pickerFilter';
import { readSelection, writeSelection } from '../../ui/forms/selection';

it('exposes long synthetic lipid choices with classes in both Data pickers', () => {
  const violin = schemaFor('results_dashboard-plot_violin').controls.find(c => c.id === 'violin_lipid')!;
  const heat = schemaFor('results_dashboard-plot_heat').controls.find(c => c.id === 'heat_lipid_selection')!;
  expect(isLongPicker(violin)).toBe(true);
  expect(isLongPicker(heat)).toBe(true);
  expect(violin.options).toEqual(heat.options);
  expect(optionClasses(heat.options!)).toEqual(['PC','PE','TG','PE-O plasmalogen ether','Triacylglycerol neutral storage','Ceramide sphingolipid backbone',
    'Sphingomyelin','Hexosylceramide glycosphingolipid','Lysophosphatidylethanolamine','Phosphatidylserine','Phosphatidylinositol',
    'Phosphatidylglycerol','Diacylglycerol','Cholesteryl ester','Cardiolipin mitochondrial','Free fatty acid','Phosphatidylethanolamine dimethyl']);
  expect(heat.options).toHaveLength(45);
  const choices = heat.options!.map(o => o.value);
  expect(readSelection(heat.default, choices, heat.defaultChoices)).toHaveLength(2);
  expect(writeSelection(choices, choices, heat.allToken)).toBe('__EVERY__');
  expect(writeSelection([], choices, heat.allToken)).toBe('[]');
});

it('keeps the long lipid choices after the mock API strips options from the shared catalog', async () => {
  const catalog = (await import('../../mock/catalog.json')).default as {outputs: {id: string; inputs?: Record<string, unknown>[]}[]};
  // api.ts (mock mode) rewrites the catalog inputs without options at load; the schema must not read them back.
  catalog.outputs.forEach(e => { e.inputs = schemaFor(e.id).controls.filter(c => !c.computed).map(({options: _options, ...control}) => control); });
  expect(isLongPicker(schemaFor('results_dashboard-plot_violin').controls.find(c => c.id === 'violin_lipid')!)).toBe(true);
  expect(isLongPicker(schemaFor('results_dashboard-plot_heat').controls.find(c => c.id === 'heat_lipid_selection')!)).toBe(true);
});
