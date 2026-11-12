// Phase 3 as cut: uploads stay single-user; in collab mode the file control is disabled and says so.
import { afterEach, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UploadControls } from './UploadControls';
import { initCollab } from '../../collab/mode';
const view = () => renderToStaticMarkup(<UploadControls uploads={[{ id: 'upload_config', label: 'Upload Layout JSON (.json):', accept: '.json' }] as never}
  sessionId="s1" instanceId="tcinstance_a1" onUploaded={() => {}} onStatus={() => {}}/>);
afterEach(() => { initCollab({ url: undefined, search: '' }); });

it('flag off: the file control is enabled', () => {
  expect(view()).not.toContain('disabled');
  expect(view()).not.toContain('Uploads are single-user for now');
});

it('collab mode: the file control is disabled with the reason', () => {
  initCollab({ url: 'ws://collab.test', search: '?project=00000000-0000-4000-8000-000000000001' });
  expect(view()).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
  expect(view()).toContain('Uploads are single-user for now');
});
