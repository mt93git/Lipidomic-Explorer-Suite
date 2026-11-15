import { describe, expect, it, vi } from 'vitest';
import { bindPlotClick, clickSourceFor, plotlyClickPoints } from './plotlyClick';
import type { CatalogEntry } from './api';

// Chart audit b12 (Astra review 2026-11-08): Team turns a click on a cell plot's point into an input change; Nexo
// forwards the click to the API as Shiny's plotly binding sends it (plotly htmlwidgets/plotly.js eventDataWithKey).
type Handler = (event: unknown) => void;
function fakePlot(data: unknown[]) {
  const handlers = new Map<string, Handler[]>();
  return {
    data,
    on(name: string, fn: Handler) { handlers.set(name, [...handlers.get(name) ?? [], fn]); },
    removeAllListeners(name: string) { handlers.delete(name); },
    emit(name: string, event: unknown) { (handlers.get(name) ?? []).forEach(fn => fn(event)); },
    count(name: string) { return handlers.get(name)?.length ?? 0; },
  };
}

describe('plotlyClickPoints (plotly eventDataWithKey)', () => {
  it('keeps curveNumber, pointNumber, x, y and adds z / customdata only when the point has them', () => {
    const points = plotlyClickPoints({points:[
      {curveNumber:1, pointNumber:3, x:12.5, y:'PC', data:{}, fullData:{}, xaxis:{}, yaxis:{}},
      {curveNumber:0, pointNumber:7, x:'Reference', y:3.2, customdata:'S07'},
      {curveNumber:2, pointNumber:4, x:1, y:2, z:3},
    ]}, []);
    expect(points).toEqual([
      {curveNumber:1, pointNumber:3, x:12.5, y:'PC'},
      {curveNumber:0, pointNumber:7, x:'Reference', y:3.2, customdata:'S07'},
      {curveNumber:2, pointNumber:4, x:1, y:2, z:3},
    ]);
  });
  it('attaches the trace key at the point (an array key) or the whole simple key, as plotly does', () => {
    const data = [{key:['a','b','c']}, {key:'all', _isSimpleKey:true}];
    expect(plotlyClickPoints({points:[{curveNumber:0, pointNumber:2, x:1, y:1}]}, data)![0].key).toBe('c');
    expect(plotlyClickPoints({points:[{curveNumber:1, pointNumber:0, x:1, y:1}]}, data)![0].key).toBe('all');
  });
  it('returns nothing for an event without points (plotly sends null)', () => {
    expect(plotlyClickPoints(undefined, [])).toBeUndefined();
    expect(plotlyClickPoints({}, [])).toBeUndefined();
  });
});

describe('clickSourceFor', () => {
  const catalog = [{id:'cell_class_plot', output:'cell_class_plot', clickSource:'cell_class_profile'}, {id:'results_dashboard-plot_pca', output:'plot_pca'}] as unknown as CatalogEntry[];
  it('reads the catalog entry of the card\'s Team source', () => {
    expect(clickSourceFor({id:'tcinstance_abcdefabcdef-cell_class_plot', instance:{source:'cell_class_plot'}}, catalog)).toBe('cell_class_profile');
    expect(clickSourceFor({id:'tcinstance_abcdefabcdef-plot_pca', instance:{source:'results_dashboard-plot_pca'}}, catalog)).toBeUndefined();
  });
});

describe('bindPlotClick', () => {
  const instance = 'tcinstance_abcdefabcdef';
  it('forwards a click as {event, source, points} and reports the inputs the module changed', async () => {
    const gd = fakePlot([{type:'bar'}]);
    const send = vi.fn(async () => ({settled:true, inputs:{cell_class:'PC'}, changed:['cell_class']}));
    const changed = vi.fn();
    expect(bindPlotClick(gd, {instanceId:instance, clickSource:'cell_class_profile', figureSource:`${instance}-cell_class_profile`, send, onChanged:changed})).toBe(true);
    gd.emit('plotly_click', {points:[{curveNumber:0, pointNumber:4, x:12, y:'PC'}]});
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith({cell_class:'PC'}));
    expect(send).toHaveBeenCalledWith({event:'plotly_click', source:'cell_class_profile', points:[{curveNumber:0, pointNumber:4, x:12, y:'PC'}]});
  });
  it('does not report anything when the module changed nothing (Team ignored the click)', async () => {
    const gd = fakePlot([{}]);
    const send = vi.fn(async () => ({settled:true, inputs:{cell_class:'PC'}, changed:[]}));
    const changed = vi.fn();
    bindPlotClick(gd, {instanceId:instance, clickSource:'cell_class_profile', figureSource:`${instance}-cell_class_profile`, send, onChanged:changed});
    gd.emit('plotly_click', {points:[{curveNumber:0, pointNumber:0, x:1, y:'PC'}]});
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(changed).not.toHaveBeenCalled();
  });
  it('binds when a render worker or the disk cache drew the figure (its source names that instance, same private source)', () => {
    const gd = fakePlot([{}]);
    const send = vi.fn(async () => ({settled:true, inputs:{}, changed:[]}));
    expect(bindPlotClick(gd, {instanceId:instance, clickSource:'cell_class_profile', figureSource:'tcinstance_pool0123456789ab-cell_class_profile', send, onChanged:() => {}})).toBe(true);
    gd.emit('plotly_click', {points:[{curveNumber:0, pointNumber:0, x:1, y:'PC'}]});
    return vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({source:'cell_class_profile'})));
  });
  it('binds nothing when the figure\'s event source is not a card\'s private source, or the plot takes no clicks', () => {
    const send = vi.fn(async () => ({settled:true, inputs:{}, changed:[]}));
    const other = fakePlot([{}]);
    expect(bindPlotClick(other, {instanceId:instance, clickSource:'cell_class_profile', figureSource:'cell_class_profile', send, onChanged:() => {}})).toBe(false);
    expect(bindPlotClick(other, {instanceId:instance, clickSource:'cell_class_profile', figureSource:`${instance}-cell_comparison_points`, send, onChanged:() => {}})).toBe(false);
    const none = fakePlot([{}]);
    expect(bindPlotClick(none, {instanceId:instance, clickSource:undefined, figureSource:`${instance}-cell_class_profile`, send, onChanged:() => {}})).toBe(false);
    expect(other.count('plotly_click') + none.count('plotly_click')).toBe(0);
  });
  it('reports a refused click to onError and keeps the card', async () => {
    const gd = fakePlot([{}]);
    const error = vi.fn();
    bindPlotClick(gd, {instanceId:instance, clickSource:'cell_comparison_points', figureSource:`${instance}-cell_comparison_points`, send:async () => { throw new Error('Unknown event source for this plot.'); }, onChanged:() => {}, onError:error});
    gd.emit('plotly_click', {points:[{curveNumber:0, pointNumber:0, x:'Reference', y:1, customdata:'S01'}]});
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});
