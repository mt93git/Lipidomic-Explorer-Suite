// Chart audit b11 F3: Team's "Upload Layout JSON (.json):" (pathway upload_config). The client checks the file as
// Team's fileInput would accept it, reports Team's own message, and keeps the uploaded layout in Nexo's member.
import { describe, expect, it } from 'vitest';
import { checkUploadFile, isUploadId, parseLayoutJson, uploadsOf, carryUploads, uploadRefused, refusal, LAYOUT_UPLOAD_LIMIT } from './layoutUpload';
import { computedResends } from './computed';
import { mockComputedLabel, mockLayoutApply, mockLayoutDownload } from '../mock/schema';

describe('layout JSON upload', () => {
  it('takes only the module configuration uploads (ids ending in config)', () => {
    expect(isUploadId('upload_config')).toBe(true);
    expect(isUploadId('sig_thresh')).toBe(false);
    expect(isUploadId('custom_nodes_json')).toBe(false);
  });
  it('accepts a .json file within the limit and refuses others with a clear message', () => {
    expect(checkUploadFile('pathway_layout_config.json', 200)).toBeNull();
    expect(checkUploadFile('LAYOUT.JSON', 200)).toBeNull();
    expect(checkUploadFile('layout.csv', 200)).toMatch(/\.json/);
    expect(checkUploadFile('layout.json', LAYOUT_UPLOAD_LIMIT + 1)).toMatch(/256 KiB/);
  });
  it("reports Team's own message for a file that is not JSON", () => {
    const bad = parseLayoutJson('this is not json {');
    expect('error' in bad && bad.error.startsWith('Error loading layout JSON:')).toBe(true);
    const ok = parseLayoutJson('{"position_overrides":{"PC":{"x":1,"y":2}}}');
    expect('value' in ok && ok.value).toEqual({position_overrides:{PC:{x:1,y:2}}});
  });
  it('a refused file (400) leaves the card up to date; any other failure does not count as a refusal', () => {
    expect(uploadRefused(refusal('Upload a .json file.'))).toBe(true);
    expect(uploadRefused(Object.assign(new Error('Session is no longer usable'), {status:409}))).toBe(false);
    expect(uploadRefused(new Error('Failed to fetch'))).toBe(false);
  });
  it('keeps the uploaded file in the member and carries it to a copy', () => {
    const member = {bqcSamples:['a'], upload_config:{name:'l.json', content:'{}'}};
    expect(uploadsOf(member)).toEqual({upload_config:{name:'l.json', content:'{}'}});
    expect(uploadsOf({upload_config:{name:'l.json'}})).toEqual({});
    const doc = carryUploads('copy', member).apply({nodes:[], nexo:{version:1, nodes:{}}} as never) as unknown as {nexo:{nodes:Record<string,{inputs:unknown}>}};
    expect(doc.nexo.nodes.copy.inputs).toEqual({upload_config:{name:'l.json', content:'{}'}});
  });
  it('is not re-sent on reopen: the layout itself is in the instance inputs Team saves', () => {
    const nodes = [{id:'n', instance:{instanceId:'tcinstance_a', source:'pathway_tab-pathwayPlot'}}] as never;
    expect(computedResends(nodes, {version:1, nodes:{n:{inputs:{upload_config:{name:'l.json', content:'{}'}}}}})).toEqual([]);
  });
});

describe('mock: the pathway layout as the module writes and reads it', () => {
  it('downloads the layout from the card inputs, and an uploaded layout changes them and the render label', () => {
    const inputs = {active_classes_json:'["GP"]', custom_nodes_json:'{}', added_edges_json:'[]', removed_edges_json:'[]', position_overrides_json:'{}'};
    const layout = JSON.parse(mockLayoutDownload(inputs));
    expect(Object.keys(layout).sort()).toEqual(['active_classes','added_edges','custom_nodes','position_overrides','removed_edges']);
    layout.position_overrides = {PC:[123, -45]};
    const next = mockLayoutApply(inputs, layout);
    expect(JSON.parse(String(next.position_overrides_json))).toEqual({PC:[123, -45]});
    expect(next.active_classes_json).toBe('["GP"]');
    expect(mockComputedLabel('pathway_tab-pathwayPlot', 'Map', next).label).toBe('Map · layout: 1 moved node');
    expect(mockComputedLabel('pathway_tab-pathwayPlot', 'Map', inputs).label).toBe('Map');
  });
});
