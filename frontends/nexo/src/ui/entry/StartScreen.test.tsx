// ENTRY-4, scene 2: Start's lists come from GET /collab/projects and GET /api/v1/datasets; nothing blocks when one fails.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { loadStart, startLists, StartView, type StartData } from './StartScreen';
import type { ProjectRow } from '../../api/projectsList';
import type { ReleasedDataset } from '../../api/datasetsList';
const now = new Date('2026-11-10T12:00:00Z');
const ds = (id: string, order: string, client: string, membersPrepare = false): ReleasedDataset =>
  ({ adminDatasetId: id, orderCode: order, version: 1, clientId: client, clientName: `Client ${client}`, releasedAt: '2026-11-10T08:00:00Z', membersPrepare });
const pr = (id: string, dataset: string, client: string, updatedAt = '2026-11-09T10:00:00Z', online: ProjectRow['online'] = []): ProjectRow =>
  ({ projectId: id, workspace: `nexo-client-${client}`, origin: { kind: 'dataset', id: dataset }, createdBy: { userId: 'u-1', displayName: 'Ada Example' },
    createdAt: '2026-11-09T10:00:00Z', updatedAt, online });
const datasets = [ds('d-1', 'ORD901', 'a'), ds('d-2', 'ORD902', 'a'), ds('d-3', 'ORD903', 'b')];
const projects = [pr('p-1', 'd-1', 'a', '2026-11-10T09:00:00Z', [{ userId: 'u-2', displayName: 'Bo Example' }]), pr('p-3', 'd-3', 'b')];
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const html = (data: StartData | undefined, view: 'staff' | 'client' | null = 'staff', filter = 'all', canUpload = false, { readOnly = false, me = null as string | null } = {}) => renderToStaticMarkup(
  <StartView view={view} data={data} filter={filter} now={now} canImport={view !== 'client'} canUpload={canUpload} readOnly={readOnly} me={me} onFilter={() => {}} onOpenProject={() => {}} onPrepareDataset={() => {}} onImportCheckpoint={() => {}} onUploadDataset={() => {}}/>);

it('released datasets leave out those that already have a project', () => {
  const lists = startLists('staff', { projects, datasets, checkpoints: null }, 'all');
  expect(lists.released.map(r => r.adminDatasetId)).toEqual(['d-2']);
});
it('projects are named by their dataset and say who prepared them and who is online', () => {
  const lists = startLists('staff', { projects, datasets, checkpoints: null }, 'all');
  expect(lists.projects[0]).toMatchObject({ projectId: 'p-1', name: 'ORD901 · v1', client: 'Client a', by: 'Ada Example', online: ['Bo Example'] });
});
it('the client filter keeps one client in both lists', () => {
  const lists = startLists('staff', { projects, datasets, checkpoints: null }, 'b');
  expect(lists.projects.map(p => p.projectId)).toEqual(['p-3']);
  expect(lists.released).toEqual([]);
  expect(lists.clients).toEqual([{ id: 'a', name: 'Client a' }, { id: 'b', name: 'Client b' }]);
});
it('a client member whose client has membersPrepare off sees no Prepare, only Waiting for the lab', () => {
  const out = html({ projects: [], datasets: [ds('d-2', 'ORD902', 'a', false)], checkpoints: null }, 'client');
  expect(out).not.toContain('>Prepare</button>');
  expect(text(out)).toContain('Waiting for the lab');
  expect(text(out)).toContain('the lab prepares it first');
  expect(text(out)).not.toContain('opens after one preparation step');
});
it('a client member whose client has membersPrepare on may prepare', () => {
  const out = html({ projects: [], datasets: [ds('d-2', 'ORD902', 'a', true)], checkpoints: null }, 'client');
  expect(out).toContain('aria-label="Prepare ORD902 · v1"');
});
it('lab staff always see Prepare and the checkpoint import', () => {
  const out = html({ projects, datasets, checkpoints: null });
  expect(out).toContain('aria-label="Prepare ORD902 · v1"');
  expect(text(out)).toContain('Import a Team checkpoint (.zip)');
});
it('a client member has no checkpoint import and no client filter', () => {
  const out = html({ projects, datasets, checkpoints: null }, 'client');
  expect(text(out)).not.toContain('Import a Team checkpoint');
  expect(out).not.toContain('Filter by client');
});
it('lab staff see Continue on the newest project, a client member New from the lab', () => {
  expect(text(html({ projects, datasets, checkpoints: null }))).toMatch(/Continue where you left off ORD901 · v1 .*Continue/);
  expect(text(html({ projects, datasets, checkpoints: null }, 'client'))).toMatch(/New from the lab ORD901 · v1 Prepared by Ada Example/);
});
it('nothing released and no projects shows the empty state with the macrophage', () => {
  const out = html({ projects: [], datasets: [], checkpoints: null }, 'client');
  expect(text(out)).toContain('Nothing here yet');
  expect(out).toContain('help-macrophage.svg');
});
it('without the projects route Start falls back to the checkpoint list and keeps the released datasets', async () => {
  const checkpoints = [{ id: 'c'.repeat(64), name: 'Synthetic save', sizeBytes: 1, sha256: 'c'.repeat(64), createdAt: '2026-11-08T10:00:00Z', source: 'store' as const }];
  const data = await loadStart({ listProjects: async () => { throw new Error('503'); }, listDatasets: async () => datasets, getCheckpoints: async () => checkpoints });
  expect(data).toEqual({ projects: null, datasets, checkpoints });
  const out = html(data);
  expect(out).toContain(`href="?checkpoint=${'c'.repeat(64)}"`);
  expect(out).toContain('aria-label="Prepare ORD901 · v1"');
});
it('without collab (null projects) Start also lists the checkpoints', async () => {
  const getCheckpoints = vi.fn(async () => []);
  expect(await loadStart({ listProjects: async () => null, listDatasets: async () => [], getCheckpoints })).toEqual({ projects: null, datasets: [], checkpoints: [] });
  expect(getCheckpoints).toHaveBeenCalledOnce();
});
it('when the datasets route fails the projects still show, with a note', async () => {
  const data = await loadStart({ listProjects: async () => projects, listDatasets: async () => { throw new Error('502'); }, getCheckpoints: async () => [] });
  expect(data).toEqual({ projects, datasets: null, checkpoints: [] });
  const out = text(html(data));
  expect(out).toContain('Open');
  expect(out).toContain('Released datasets could not load.');
});
// ENTRY-INT step 5: the Excel upload (ENTRY-6) on Start, then Prepare with the new upload id.
it('Start offers the Excel upload when it is allowed', () => {
  expect(text(html({ projects, datasets, checkpoints: null }, 'staff', 'all', true))).toContain('Upload an Excel workbook');
  expect(text(html({ projects, datasets, checkpoints: null }, 'staff', 'all', false))).not.toContain('Upload an Excel workbook');
});
it('a client member allowed to prepare sees the upload with nothing released yet', () => {
  expect(text(html({ projects: [], datasets: [], checkpoints: null }, 'client', 'all', true))).toMatch(/Nothing here yet.*Upload an Excel workbook/);
});

it('loads checkpoints when projects are available', async () => {
  const getCheckpoints = vi.fn(async () => []);
  expect(await loadStart({ listProjects: async () => projects, listDatasets: async () => datasets, getCheckpoints })).toEqual({ projects, datasets, checkpoints: [] });
  expect(getCheckpoints).toHaveBeenCalledOnce();
});
it('checkpoint failure leaves projects and datasets available', async () => {
  expect(await loadStart({ listProjects: async () => projects, listDatasets: async () => datasets, getCheckpoints: async () => { throw new Error('503'); } })).toEqual({ projects, datasets, checkpoints: null });
});
it('shows grouped checkpoints after projects even when projects are empty', () => {
  const checkpoints = [{ id: 'c'.repeat(64), name: 'Synthetic Team', sizeBytes: 1, sha256: 'c'.repeat(64), createdAt: '2026-11-08T10:00:00Z', source: 'folder' as const }];
  const out = html({ projects: [], datasets: [], checkpoints });
  expect(out.indexOf('Projects')).toBeLessThan(out.indexOf('Your checkpoints'));
  expect(out).toContain('aria-label="Prepared in Team"');
  expect(out).toContain(`href="?checkpoint=${'c'.repeat(64)}"`);
});
// UX review 3, group D: Start on phones and its copy.
it('on a view-only device a released dataset says Prepare on a computer instead of Prepare', () => {
  const out = html({ projects, datasets, checkpoints: null }, 'staff', 'all', false, { readOnly: true });
  expect(out).not.toContain('aria-label="Prepare ORD902 · v1"');
  expect(out).toContain('<span class="start-waiting">Prepare on a computer</span>');
});
it('with the filter on All and no projects Start says No projects yet.', () => {
  expect(text(html({ projects: [], datasets, checkpoints: null }))).toContain('No projects yet.');
  expect(text(html({ projects: [], datasets, checkpoints: null }, 'staff', 'b'))).toContain('No projects for this client yet.');
});
it('the client filter is hidden when there is only one client', () => {
  expect(html({ projects, datasets: [ds('d-1', 'ORD901', 'a')], checkpoints: null })).not.toContain('Filter by client');
});
it('a project the caller created says Prepared by you', () => {
  expect(text(html({ projects, datasets, checkpoints: null }, 'client', 'all', false, { me: 'u-1' }))).toContain('Prepared by you · yesterday');
});
it('the avatars and their sentence share one unbroken group', () => {
  expect(html({ projects, datasets, checkpoints: null })).toContain('<span class="start-online"><span class="start-avs"');
});
it('one checkpoint group has no sub-heading under Your checkpoints', () => {
  const checkpoints = [{ id: 'c'.repeat(64), name: 'Synthetic Team', sizeBytes: 1, sha256: 'c'.repeat(64), createdAt: '2026-11-08T10:00:00Z', source: 'folder' as const }];
  expect(html({ projects: [], datasets: [], checkpoints })).not.toContain('<h2>Prepared in Team</h2>');
});
