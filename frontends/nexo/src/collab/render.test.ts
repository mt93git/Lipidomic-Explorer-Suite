import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { currentRender, followChanges } from './render';

it('a render older than meta.engineRevision is discarded and asked again', async () => {
  const ask = vi.fn().mockResolvedValueOnce({ engineRevision: 7, figure: 'old' }).mockResolvedValueOnce({ engineRevision: 8, figure: 'new' });
  await expect(currentRender(ask, () => 8)).resolves.toEqual({ engineRevision: 8, figure: 'new' });
  expect(ask).toHaveBeenCalledTimes(2);
});

it('a render at the current revision is kept', async () => {
  const ask = vi.fn().mockResolvedValue({ engineRevision: 8, figure: 'now' });
  await expect(currentRender(ask, () => 8)).resolves.toEqual({ engineRevision: 8, figure: 'now' });
  expect(ask).toHaveBeenCalledOnce();
});

const change = (actor: string) => ({ nodeId: 'n1', actor, displayName: 'Ana Synthetic', kind: 'inputs', revision: 9 });
it("another person's change names its card: Updated by", () => {
  const meta = new Y.Doc().getMap('meta'), changed = vi.fn();
  followChanges(meta, () => 'user-me', changed);
  meta.set('lastChange', change('user-ana'));
  expect(changed).toHaveBeenCalledExactlyOnceWith('n1', 'Updated by Ana Synthetic');
});

it('my own change is not announced', () => {
  const meta = new Y.Doc().getMap('meta'), changed = vi.fn();
  followChanges(meta, () => 'user-me', changed);
  meta.set('lastChange', change('user-me'));
  meta.set('engineRevision', 9);
  expect(changed).not.toHaveBeenCalled();
});

it.each(['analysis', 'cohort', 'palette', 'design'])('a remote %s commit reloads every card', kind => {
  const doc = new Y.Doc(), meta = doc.getMap('meta'), changed = vi.fn();
  doc.getMap('nodes').set('n1', new Y.Map());
  doc.getMap('nodes').set('n2', new Y.Map());
  followChanges(meta, () => 'user-me', changed);
  meta.set('lastChange', { nodeId: null, actor: 'user-ana', displayName: 'Ana Synthetic', kind, revision: 9 });
  expect(changed.mock.calls).toEqual([['n1', 'Updated by Ana Synthetic'], ['n2', 'Updated by Ana Synthetic']]);
});

it('rechecks the revision when the document advances during the second request', async () => {
  let revision = 2;
  const ask = vi.fn()
    .mockResolvedValueOnce({ engineRevision: 1 })
    .mockImplementationOnce(async () => { revision = 3; return { engineRevision: 2 }; })
    .mockResolvedValueOnce({ engineRevision: 3 });
  await expect(currentRender(ask, () => revision)).resolves.toEqual({ engineRevision: 3 });
  expect(ask).toHaveBeenCalledTimes(3);
});

it('rejects a still stale render after three requests', async () => {
  const ask = vi.fn().mockResolvedValue({ engineRevision: 1 });
  await expect(currentRender(ask, () => 2)).rejects.toThrow('The plot is still behind the shared board. Please retry.');
  expect(ask).toHaveBeenCalledTimes(3);
});

it('a remote version save changes no science: no card reloads', () => {
  const doc = new Y.Doc(), meta = doc.getMap('meta'), changed = vi.fn();
  doc.getMap('nodes').set('n1', new Y.Map());
  followChanges(meta, () => 'user-me', changed);
  meta.set('lastChange', { nodeId: null, actor: 'user-ana', displayName: 'Ana Synthetic', kind: 'save', revision: 9 });
  expect(changed).not.toHaveBeenCalled();
});

it("another person's new card is announced with its title, not as an update", () => {
  const doc = new Y.Doc(), meta = doc.getMap('meta'), changed = vi.fn(), added = vi.fn();
  followChanges(meta, () => 'user-me', changed, added);
  doc.transact(() => {
    doc.getMap('nodes').set('n9', new Y.Map([['label', new Y.Text('Abundance heatmap')]]));
    meta.set('lastChange', { nodeId: 'n9', actor: 'user-ana', displayName: 'Ana Synthetic', kind: 'createCard', revision: 9 });
  }, 'server');
  expect(added).toHaveBeenCalledExactlyOnceWith('n9', 'Ana Synthetic added Abundance heatmap');
  expect(changed).not.toHaveBeenCalled();
});

it('my own new card is not announced', () => {
  const doc = new Y.Doc(), meta = doc.getMap('meta'), added = vi.fn();
  followChanges(meta, () => 'user-me', vi.fn(), added);
  meta.set('lastChange', { nodeId: 'n9', actor: 'user-me', displayName: 'Me', kind: 'createCard', revision: 9 });
  expect(added).not.toHaveBeenCalled();
});
