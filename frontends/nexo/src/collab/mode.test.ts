import { expect, test } from 'vitest';
import { decideCollab } from './mode';

const url = 'ws://127.0.0.1:1234/collab', project = '0a000000-0000-4000-8000-000000000001';

test('off without VITE_COLLAB_URL', () => {
  expect(decideCollab({ url: undefined, search: `?project=${project}` })).toBeNull();
});
test('off for this page with ?collab=0', () => {
  expect(decideCollab({ url, search: `?project=${project}&collab=0` })).toBeNull();
});
test('off without a project id', () => {
  expect(decideCollab({ url, search: '?checkpoint=abc' })).toBeNull();
  expect(decideCollab({ url, search: '?project=not-a-uuid' })).toBeNull();
});
test('on with the build URL and a project id', () => {
  expect(decideCollab({ url, search: `?checkpoint=abc&project=${project}` })).toEqual({ url, project });
});
