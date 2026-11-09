import {expect,it} from 'vitest';
import {snapshotFits,provenance,isStale,messages} from './finalize';
it('limits URLs at exactly 4 MiB',()=>{expect(snapshotFits('x'.repeat(4194304))).toBe(true);expect(snapshotFits('x'.repeat(4194305))).toBe(false);expect(snapshotFits(null)).toBe(false);});
it('stamps capture v2 and statistics',()=>{expect(provenance({preparationRevision:3,statistics:{statisticsFingerprint:'abc'}})).toEqual({preparationRevision:3,captureVersion:2,statisticsFingerprint:'abc'});});
it('compares revisions but never ages illustrations',()=>{const finished={provenance:{preparationRevision:3}};expect(isStale({kind:'plot',finished},4)).toBe(true);expect(isStale({kind:'plot',finished},3)).toBe(false);expect(isStale({kind:'illustration',finished},4)).toBe(false);});

it('retains Team refusal messages',()=>{
 expect(messages.tooLarge).toBe('This figure is too large to finish and save. The live plot remains editable; reduce its size or use its existing download controls.');
 expect(messages.updating).toBe('Wait for preparation and this plot to finish updating before finishing the figure.');
 expect(messages.statistics).toBe('Wait for the violin statistics to finish before finishing the plot.');
});
it('finishing and editing each undo in one step and redo restores the snapshot',async()=>{
 const {createStore}=await import('../state/store');const {createHistory}=await import('../state/history');const {setFinished}=await import('../state/commands');
 const node={kind:'plot' as const,id:'plot',label:'Plot',x:0,y:0,width:440,height:330,finished:null as import('../api').Node['finished']};
 const store=createStore({nodes:[node]}),history=createHistory(store);
 const finished={url:'data:image/svg+xml,%3Csvg%2F%3E',createdAt:'2026-11-06T00:00:00Z',stale:false,provenance:provenance({preparationRevision:1})};
 history.dispatch(setFinished(node.id,finished));expect(store.get().nodes[0].finished).toEqual(finished);
 history.undo();expect(store.get().nodes[0].finished).toBeNull();history.redo();expect(store.get().nodes[0].finished).toEqual(finished);
 history.dispatch(setFinished(node.id,null));expect(store.get().nodes[0].finished).toBeNull();history.undo();expect(store.get().nodes[0].finished).toEqual(finished);
});
