import { expect, test, afterEach } from 'vitest';
import { checkpointHandle, tabsBridges, type CanvasHandle } from './handle';
import { initCollab } from '../collab/mode';
import { initial, addTab } from '../state/tabs';

afterEach(() => initCollab({url:'', search:''}));
function snapshot(shared: boolean) {
 initCollab({url:shared ? 'ws://synthetic.invalid' : '', search:'?project=0a000000-0000-4000-8000-0000000000f5'});
 const tabs = initial([]);
 addTab(tabs, 'Other');
 const handle = {} as CanvasHandle;
 tabsBridges.set(handle, {document:() => ({version:'1', nodes:[], tabs})} as unknown as Parameters<typeof tabsBridges.set>[1]);
 return checkpointHandle(handle).snapshotState();
}
test('shared handle exports the deterministic saved tab instead of personal active', () => {
 expect(snapshot(true).tabs).toMatchObject({active:'tab-1', savedActive:'tab-1'});
});
test('single user handle keeps personal active', () => {
 expect(snapshot(false).tabs).toMatchObject({active:'tab-2'});
 expect(snapshot(false).tabs).not.toHaveProperty('savedActive');
});
