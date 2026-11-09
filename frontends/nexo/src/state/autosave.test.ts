import { afterEach, expect, test, vi } from 'vitest';
import { createAutosave } from './autosave';
afterEach(() => vi.useRealTimers());
test('edit saves at 15s; continuous edits at 60s', async () => {
 vi.useFakeTimers(); const save=vi.fn(async()=>{}), a=createAutosave({save}); a.markDirty();
 await vi.advanceTimersByTimeAsync(14999); expect(save).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1); expect(save).toHaveBeenCalledTimes(1);
 a.markDirty(); for(let i=0;i<11;i++){await vi.advanceTimersByTimeAsync(5000);a.markDirty();}
 await vi.advanceTimersByTimeAsync(5000); expect(save).toHaveBeenCalledTimes(2); a.dispose();
});
test('failure retries after 5s', async()=>{
 vi.useFakeTimers(); const save=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined),a=createAutosave({save});
 a.markDirty(); await a.flush(); expect(a.state().status).toBe('error'); await vi.advanceTimersByTimeAsync(5000);expect(save).toHaveBeenCalledTimes(2);a.dispose();
});
test('stale ack keeps dirty; edits during save resave after 1s',async()=>{
 vi.useFakeTimers();let done!:()=>void;const save=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>done=r)).mockResolvedValue(undefined),a=createAutosave({save});
 a.markDirty();const pending=a.flush();a.markDirty();done();await pending;expect(a.state().status).toBe('dirty');
 await vi.advanceTimersByTimeAsync(999);expect(save).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1);expect(save).toHaveBeenCalledTimes(2);a.dispose();
});
test('watchdog ignores a late ack and retries without losing edits',async()=>{
 vi.useFakeTimers();let done!:()=>void;const save=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>done=r)).mockResolvedValue(undefined),a=createAutosave({save});
 a.markDirty();void a.flush();await vi.advanceTimersByTimeAsync(135000);expect(a.state().status).toBe('error');done();await Promise.resolve();expect(a.state().savedRevision).toBe(0);
 await vi.advanceTimersByTimeAsync(5000);expect(save).toHaveBeenCalledTimes(2);expect(a.state().status).toBe('saved');a.dispose();
});
test('paused and view-only suppress saves; busy retries stop after 24',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValue(Error('busy')),a=createAutosave({save});
 a.pause();a.markDirty();await a.flush();expect(a.state().text).toBe('Autosave paused');expect(save).not.toHaveBeenCalled();
 a.pause(true);expect(a.state().text).toBe('View-only access');a.resume();await a.flush();await vi.advanceTimersByTimeAsync(125000);expect(save).toHaveBeenCalledTimes(25);a.dispose();
});
test('H8 journeys 8.1: a failed save keeps its reason until a save succeeds',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValueOnce(Error('Error: Checkpoint storage is full')).mockResolvedValue(undefined),a=createAutosave({save});
 a.markDirty();await a.flush();expect(a.state()).toMatchObject({status:'error',text:'Save failed · Retrying',failure:'Checkpoint storage is full'});
 await vi.advanceTimersByTimeAsync(5000);expect(a.state()).toMatchObject({status:'saved',failure:''});a.dispose();
});
test('a lost session that could not be reopened shows the failure and is not retried (no retry loop)',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValue(Object.assign(Error('The analysis session was lost and could not be reopened.'),{name:'SessionLostError',retryable:false})),a=createAutosave({save});
 a.markDirty();await a.flush();expect(a.state().status).toBe('error');expect(a.state().failure).toMatch(/could not be reopened/);
 await vi.advanceTimersByTimeAsync(120000);expect(save).toHaveBeenCalledTimes(1);a.dispose();
});
// Nexo Phase 1 small fixes item 4 (b01 open question): an API outage or restart gives one non-repeating pill status with
// backoff (no toast storm); a lost session stops retrying and offers Reopen; edits are never dropped.
const outage=(status:number)=>Object.assign(Error(`Request failed (${status})`),{status});
test('outage (500/502/503/network): one "Can\'t reach the server" status, backoff, recovers by itself',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValueOnce(outage(500)).mockRejectedValueOnce(outage(502)).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(outage(503)).mockResolvedValue(undefined),a=createAutosave({save});
 const seen:string[]=[];a.subscribe(()=>seen.push(`${a.state().status}:${a.state().text}`));
 a.markDirty();await a.flush();expect(a.state()).toMatchObject({status:'offline',text:"Can't reach the server · retrying"});
 await vi.advanceTimersByTimeAsync(5000);expect(save).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(9999);expect(save).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1);expect(save).toHaveBeenCalledTimes(3);
 a.markDirty();expect(a.state().status).toBe('offline');
 await vi.advanceTimersByTimeAsync(20000);expect(save).toHaveBeenCalledTimes(4);
 await vi.advanceTimersByTimeAsync(40000);expect(save).toHaveBeenCalledTimes(5);
 expect(a.state().status).toBe('saved');expect(a.state().savedRevision).toBe(2);
 // The pill said it once: no Saving…/error flicker between retries.
 const before=seen.slice(0,seen.indexOf(seen.find(x=>x.startsWith('saved'))!));
 expect(before.filter(x=>x.startsWith('offline')).length).toBeGreaterThanOrEqual(1);
 expect(before.slice(before.findIndex(x=>x.startsWith('offline'))).every(x=>x.startsWith('offline'))).toBe(true);
 expect(seen.some(x=>x.startsWith('error'))).toBe(false);a.dispose();
});
test('outage backoff caps at 60 s',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValue(outage(503)),a=createAutosave({save});
 a.markDirty();await a.flush();for(const ms of [5000,10000,20000,40000,60000,60000]){await vi.advanceTimersByTimeAsync(ms);}
 expect(save).toHaveBeenCalledTimes(7);expect(a.state().status).toBe('offline');a.dispose();
});
test('409 session_lost: no retry, Reopen offered (lost), edits kept; reopen() retries and the pill returns to normal',async()=>{
 vi.useFakeTimers();const save=vi.fn().mockRejectedValueOnce(Object.assign(Error('Session is no longer usable; reopen the checkpoint.'),{status:409,code:'session_lost'})).mockResolvedValue(undefined),a=createAutosave({save});
 a.markDirty();await a.flush();expect(a.state()).toMatchObject({status:'error',lost:true});
 a.markDirty();await vi.advanceTimersByTimeAsync(120000);expect(save).toHaveBeenCalledTimes(1);expect(a.state().revision).toBe(2);expect(a.state().savedRevision).toBe(0);
 a.reopened();await vi.advanceTimersByTimeAsync(0);expect(save).toHaveBeenCalledTimes(2);expect(a.state()).toMatchObject({status:'saved',lost:false,savedRevision:2});a.dispose();
});
// Steph review row 12: a reopened checkpoint showed "Unsaved changes · Autosave on". Opening sets nothing dirty; the
// pill was dirty because a change and its undo (back to the saved document) counted as unsaved. Autosave now compares
// the document with the one opened or last saved.
test('Steph 12: a change undone back to the opened document is not unsaved; nothing is saved',async()=>{
 vi.useFakeTimers();const save=vi.fn(async()=>{}),a=createAutosave({save});a.baseline('{"layout":"figure1"}');
 a.markDirty('{"layout":"free"}');expect(a.state().status).toBe('dirty');
 a.markDirty('{"layout":"figure1"}');expect(a.state()).toMatchObject({status:'idle',text:'Saved workspace restored'});expect(a.state().revision).toBe(a.state().savedRevision);
 await vi.advanceTimersByTimeAsync(60000);expect(save).not.toHaveBeenCalled();a.dispose();
});
test('Steph 12: after a save, a change undone back to the saved document shows Saved again',async()=>{
 vi.useFakeTimers();const save=vi.fn(async()=>{}),a=createAutosave({save});a.baseline('A');
 a.markDirty('B');await a.flush();expect(a.state().status).toBe('saved');const text=a.state().text;
 a.markDirty('C');expect(a.state().status).toBe('dirty');a.markDirty('B');expect(a.state()).toMatchObject({status:'saved',text});
 await vi.advanceTimersByTimeAsync(60000);expect(save).toHaveBeenCalledTimes(1);a.dispose();
});
test('Steph 12: a real change stays unsaved and is saved; markDirty without content keeps the old behaviour',async()=>{
 vi.useFakeTimers();const save=vi.fn(async()=>{}),a=createAutosave({save});a.baseline('A');
 a.markDirty('B');await vi.advanceTimersByTimeAsync(15000);expect(save).toHaveBeenCalledTimes(1);expect(a.state().status).toBe('saved');
 a.markDirty();expect(a.state().status).toBe('dirty');a.dispose();
});
