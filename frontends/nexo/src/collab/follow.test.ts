import { afterEach, expect, test } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { createFollow, followCamera, followers, summonHandler, type View } from './follow';

const made: Awareness[] = [];
afterEach(() => { made.splice(0).forEach(a => a.destroy()); });
// Leader A publishes its view; follower B receives it as the sidecar would relay it.
function pair(size = { width: 1920, height: 1080 }) {
  const a = new Awareness(new Y.Doc()), b = new Awareness(new Y.Doc()); made.push(a, b);
  a.setLocalState({ displayName: 'Ada Example' });
  const relay = () => applyAwarenessUpdate(b, encodeAwarenessUpdate(a, [a.clientID]), 'test');
  const applied: { activeTab: string; camera: View['camera'] }[] = [], names: (string | null)[] = [];
  const follow = createFollow(b, { size: () => size, apply: view => applied.push(view), changed: name => names.push(name) });
  const publish = (view: View) => { a.setLocalStateField('view', view); relay(); };
  return { a, b, relay, applied, names, follow, publish };
}
const full = { width: 1920, height: 1080 };

for (const scale of [0.5, 1, 1.5]) test(`camera adopted at ${scale * 100} % with the same viewport`, () => {
  const { a, applied, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 120, y: -40, scale }, viewport: full });
  follow.start(a.clientID);
  expect(applied.at(-1)).toEqual({ activeTab: 't1', camera: { x: 120, y: -40, scale } });
});

for (const scale of [0.5, 1, 1.5]) test(`a smaller viewport shows the leader's rectangle at ${scale * 100} %`, () => {
  const { a, applied, follow, publish } = pair({ width: 960, height: 1080 });
  publish({ activeTab: 't1', camera: { x: 100, y: 50, scale }, viewport: full });
  follow.start(a.clientID);
  const { camera } = applied.at(-1)!, world = (sx: number, sy: number, c: View['camera']) => [(sx - c.x) / c.scale, (sy - c.y) / c.scale];
  expect(camera.scale).toBeCloseTo(scale / 2);
  // The leader's centre is the follower's centre; its full width fits the follower's.
  world(480, 540, camera).forEach((v, i) => expect(v).toBeCloseTo(world(960, 540, { x: 100, y: 50, scale })[i]));
  world(0, 540, camera).forEach((v, i) => expect(v).toBeCloseTo(world(0, 540, { x: 100, y: 50, scale })[i]));
});

test('every change of the leader view is adopted, a tab switch included', () => {
  const { a, applied, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 }, viewport: full });
  follow.start(a.clientID);
  publish({ activeTab: 't2', camera: { x: 10, y: 20, scale: 1 }, viewport: full });
  expect(applied).toEqual([{ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 } }, { activeTab: 't2', camera: { x: 10, y: 20, scale: 1 } }]);
});

test('following shows the leader name and stops on Stop', () => {
  const { a, applied, names, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 }, viewport: full });
  follow.start(a.clientID); follow.stop();
  publish({ activeTab: 't1', camera: { x: 5, y: 0, scale: 1 }, viewport: full });
  expect(names).toEqual(['Ada Example', null]);
  expect(applied).toHaveLength(1);
});

test('my own pan stops following', () => {
  const { a, applied, names, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 }, viewport: full });
  follow.start(a.clientID);
  follow.moved('t1', { x: 0, y: 0, scale: 1 });
  expect(names).toEqual(['Ada Example']);
  follow.moved('t1', { x: 30, y: 0, scale: 1 });
  publish({ activeTab: 't1', camera: { x: 5, y: 0, scale: 1 }, viewport: full });
  expect(names).toEqual(['Ada Example', null]);
  expect(applied).toHaveLength(1);
});

test('the leader leaving stops following', () => {
  const { a, b, names, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 }, viewport: full });
  follow.start(a.clientID);
  removeAwarenessStates(b, [a.clientID], 'test');
  expect(names).toEqual(['Ada Example', null]);
});

test("a summon starts following its sender, other messages don't", () => {
  const started: number[] = [], handle = summonHandler(id => started.push(id));
  handle(JSON.stringify({ type: 'refused', reason: 'viewer' })); handle('not json');
  handle(JSON.stringify({ type: 'summon', from: 42 }));
  expect(started).toEqual([42]);
});

test('without a published viewport the camera is taken as is', () => {
  expect(followCamera({ activeTab: 't1', camera: { x: 3, y: 4, scale: 2 } }, { width: 500, height: 400 })).toEqual({ x: 3, y: 4, scale: 2 });
});

test('who I follow is published in awareness and cleared when I stop', () => {
  const { a, b, follow, publish } = pair();
  publish({ activeTab: 't1', camera: { x: 0, y: 0, scale: 1 }, viewport: full });
  follow.start(a.clientID);
  expect(b.getLocalState()?.following).toBe(a.clientID);
  follow.stop();
  expect(b.getLocalState()?.following).toBeNull();
});

test('the presenter counts the people following them, one per person', () => {
  const presenter = new Awareness(new Y.Doc()); made.push(presenter);
  const tab = (userId: string, following: number) => { const other = new Awareness(new Y.Doc()); made.push(other);
    other.setLocalState({ userId, following }); applyAwarenessUpdate(presenter, encodeAwarenessUpdate(other, [other.clientID]), 'test'); };
  expect(followers(presenter)).toBe(0);
  tab('u-b', presenter.clientID); tab('u-b', presenter.clientID); tab('u-c', presenter.clientID); tab('u-d', 12345);
  expect(followers(presenter)).toBe(2);
});
