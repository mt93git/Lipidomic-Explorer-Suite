// Scene 2 · Start (docs/integration/nexo-entry-proposal): the caller's projects (C4), the released datasets nobody has
// prepared yet (C2) and, for lab staff, the checkpoint import. A failed or missing route never blocks: what loaded shows,
// including checkpoints alongside projects.
import { useEffect, useState } from 'react';
import { getCheckpoints, type AdminView, type Checkpoint } from '../../api';
import { knownMembersPrepare, listDatasets, type ReleasedDataset } from '../../api/datasetsList';
import { listProjects, type ProjectRow } from '../../api/projectsList';
import { adminUserId, knownClientNames } from '../../api/adminToken';
import { checkpointRows, groupTitles, type CheckpointGroup } from '../checkpointList';
import { checkpointLabel } from '../topBarLabel';
import { datasetUploadAllowed, uploadAllowed } from '../uploadAccess';
import { UploadDataset } from './UploadDataset';
import { isReadOnly } from '../../state/readonly';
import './StartScreen.css';
export const startStrings = {
  welcomeBack: 'Welcome back', welcome: 'Welcome', staff: 'Lab staff · all clients', yourGroup: 'Your group', yours: 'Your projects',
  loading: 'Loading your projects…', continueLabel: 'Continue where you left off', continue: 'Continue', newLabel: 'New from the lab', open: 'Open',
  projects: 'Projects', allClients: 'All clients', filter: 'Filter by client', noProjects: 'No projects yet.', noClientProjects: 'No projects for this client yet.',
  projectsFailed: 'Projects could not load. Try again in a moment.', checkpoints: 'Your checkpoints', noCheckpoints: 'No checkpoints yet.',
  released: 'Released datasets', notPrepared: (n: number) => `${n} not prepared yet`, nothingWaiting: 'Nothing waiting for this client.',
  releasedFailed: 'Released datasets could not load. Try again in a moment.', prepare: 'Prepare', prepareElsewhere: 'Prepare on a computer', waiting: 'Waiting for the lab',
  fromLab: 'From the lab', newTag: 'New', oneStep: 'opens after one preparation step', labFirst: 'the lab prepares it first', importAsk: 'Have a checkpoint saved from Team?',
  importZip: 'Import a Team checkpoint (.zip)', uploadAsk: 'Have an extra Excel workbook?', uploadXlsx: 'Upload an Excel workbook', emptyTitle: 'Nothing here yet',
  emptyClient: (group: string) => `When the lab releases a dataset to ${group}, it shows up on this page, ready to open.`,
  emptyStaff: 'When a dataset is released in Admin, it shows up on this page, ready to prepare.', emptyAsk: 'Expecting one already? Ask your lab contact.',
  preparedBy: (who: string, when: string) => `Prepared by ${who} · ${when}`, onBoard: (names: string[]) => `${names.join(', ')} on the board now`,
  edited: (when: string) => `edited ${when}`, releasedWhen: (when: string) => `Released ${when}`, theLab: 'the lab', you: 'you', checkpoint: 'Team checkpoint', dataset: 'Released dataset',
};
const s = startStrings;
/** What Start loaded: null = that route failed or is not there (projects without collab). each route can fail independently. */
export interface StartData { projects: ProjectRow[] | null; datasets: ReleasedDataset[] | null; checkpoints: Checkpoint[] | null }
export async function loadStart(deps: { listProjects: () => Promise<ProjectRow[] | null>; listDatasets: () => Promise<ReleasedDataset[]>; getCheckpoints: () => Promise<Checkpoint[]> }): Promise<StartData> {
  const [projects, datasets, checkpoints] = await Promise.all([deps.listProjects().catch(() => null), deps.listDatasets().catch(() => null), deps.getCheckpoints().catch(() => null)]);
  return { projects, datasets, checkpoints };
}
export interface ProjectItem { projectId: string; name: string; client?: string; clientId?: string; by: string; createdAt: string; updatedAt: string; online: string[] }
export interface ReleasedItem { adminDatasetId: string; name: string; client: string; releasedAt: string; canPrepare: boolean }
const clientOf = (workspace: string) => /^nexo-client-(.+)$/.exec(workspace)?.[1];
const order = (d: ReleasedDataset) => `${d.orderCode} · v${d.version}`;
/** The rows Start shows: projects named by their dataset or checkpoint (as the board's top bar), released datasets without a project, the clients to filter by. */
export function startLists(view: AdminView | null, data: StartData, filter: string, me: string | null = null) {
  const datasets = data.datasets ?? [], byId = new Map(datasets.map(d => [d.adminDatasetId, d]));
  const prepared = new Set((data.projects ?? []).filter(p => p.origin.kind === 'dataset').map(p => p.origin.id));
  const clients = [...new Map(datasets.map(d => [d.clientId, { id: d.clientId, name: d.clientName }])).values()];
  const keep = (clientId?: string) => filter === 'all' || clientId === filter;
  const projects: ProjectItem[] = (data.projects ?? []).map(p => {
    const d = p.origin.kind === 'dataset' ? byId.get(p.origin.id) : undefined, clientId = d?.clientId ?? clientOf(p.workspace);
    return { projectId: p.projectId, name: d ? order(d) : p.origin.kind === 'checkpoint' ? checkpointLabel(data.checkpoints ?? [], p.origin.id, s.checkpoint) : s.dataset, client: d?.clientName ?? clients.find(c => c.id === clientId)?.name, clientId,
      by: me && p.createdBy.userId === me ? s.you : p.createdBy.displayName ?? s.theLab, createdAt: p.createdAt, updatedAt: p.updatedAt, online: p.online.map(o => o.displayName ?? '').filter(Boolean) };
  }).filter(p => keep(p.clientId));
  const released: ReleasedItem[] = datasets.filter(d => !prepared.has(d.adminDatasetId) && keep(d.clientId))
    .map(d => ({ adminDatasetId: d.adminDatasetId, name: order(d), client: d.clientName, releasedAt: d.releasedAt, canPrepare: view !== 'client' || d.membersPrepare }));
  return { projects, released, clients };
}
/** "today", "yesterday" or the day ("9 Nov"). */
export function when(iso: string, now: Date) {
  const date = new Date(iso); if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function Online({ names }: { names: string[] }) {
  return names.length ? <span className="start-online"><span className="start-avs" aria-hidden="true">{names.map(n => <span key={n} className="start-av" title={n}>{initials(n)}</span>)}</span><span>{s.onBoard(names)}</span></span> : null;
}
const Arrow = () => <svg className="start-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
export interface StartViewProps { view: AdminView | null; data: StartData | undefined; filter: string; now: Date; canImport: boolean; canUpload: boolean; readOnly: boolean; me: string | null; clientNames?: string[]; onFilter(id: string): void; onOpenProject(projectId: string): void; onPrepareDataset(adminDatasetId: string): void; onImportCheckpoint(): void; onUploadDataset(): void }
export function StartView({ view, data, filter, now, canImport, canUpload, readOnly, me, clientNames = [], onFilter, onOpenProject, onPrepareDataset, onImportCheckpoint, onUploadDataset }: StartViewProps) {
  const client = view === 'client', lists = data && startLists(view, data, filter, me);
  // The released list's clients, else (nothing released yet) the ones Admin named for the person.
  const listed = [...new Set((data?.datasets ?? []).map(d => d.clientName))], groups = listed.length ? listed : clientNames;
  const lede = client ? groups.join(' · ') || s.yourGroup : view === 'staff' ? s.staff : s.yours;
  const empty = !!data && data.datasets?.length === 0 && (data.projects ?? []).length === 0 && (data.checkpoints ?? []).length === 0;
  const feature = lists?.projects[0];
  // The group sub-heading under "Your checkpoints" only when there is more than one group.
  const checkpointGroups = new Set(checkpointRows(data?.checkpoints ?? []).map(r => r.group)).size;
  const uploadLine = canUpload && <p className="start-tert"><svg className="start-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg><span>{s.uploadAsk}</span><button type="button" className="start-link" onClick={onUploadDataset}>{s.uploadXlsx}</button></p>;
  const importLine = canImport && <p className="start-tert"><svg className="start-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7 10l5-5 5 5M5 19h14"/></svg><span>{s.importAsk}</span><button type="button" className="start-link" onClick={onImportCheckpoint}>{s.importZip}</button></p>;
  return <div className="entry-start"><div className="start-sheet">
    <h1>{view === 'staff' ? s.welcomeBack : s.welcome}</h1>
    <p className="start-lede">{lede}</p>
    {!data || !lists ? <p className="start-status" role="status">{s.loading}</p> : empty ? <>
      <div className="start-empty"><img src={`${import.meta.env.BASE_URL}entry/help-macrophage.svg`} alt=""/><h2>{s.emptyTitle}</h2>
        <p>{client ? s.emptyClient(groups[0] ?? s.yourGroup.toLowerCase()) : s.emptyStaff}</p><p className="start-small">{s.emptyAsk}</p></div>{uploadLine}{importLine}</> : <>
      {feature && <section className="start-feature" aria-label={client ? s.newLabel : s.continueLabel}><div className="start-grow">
        <p className="start-small">{client ? s.newLabel : s.continueLabel}</p><h2>{feature.name}</h2>
        <div className="start-meta"><span>{client ? s.preparedBy(feature.by, when(feature.createdAt, now)) : [feature.client, s.edited(when(feature.updatedAt, now))].filter(Boolean).join(' · ')}</span><Online names={feature.online}/></div></div>
        <button type="button" className="start-btn primary" onClick={() => onOpenProject(feature.projectId)}>{client ? s.open : s.continue} <Arrow/></button></section>}
      {data.projects !== null ? <section className="start-sec" aria-labelledby="start-projects"><header><h2 id="start-projects">{s.projects} <span>{lists.projects.length}</span></h2>
        {!client && lists.clients.length > 1 && <div className="start-seg" role="group" aria-label={s.filter}>{[{ id: 'all', name: s.allClients }, ...lists.clients].map(c =>
          <button type="button" key={c.id} aria-pressed={filter === c.id} onClick={() => onFilter(c.id)}>{c.name}</button>)}</div>}</header>
        <ul className="start-rows">{lists.projects.length ? lists.projects.map(p => <li key={p.projectId}><div><div className="start-name">{p.name}</div>{p.client && <div className="start-sub">{p.client}</div>}</div>
          <div className="start-state"><span>{s.preparedBy(p.by, when(p.createdAt, now))}</span><Online names={p.online}/></div>
          <button type="button" className="start-btn secondary small" aria-label={`${s.open} ${p.name}`} onClick={() => onOpenProject(p.projectId)}>{s.open}</button></li>)
          : <li><div className="start-sub">{filter === 'all' ? s.noProjects : s.noClientProjects}</div></li>}</ul></section>
      : null}
      {!!data.checkpoints?.length && <section className="start-sec" aria-labelledby="start-checkpoints"><header><h2 id="start-checkpoints">{s.checkpoints}</h2></header>
        {(['folder', 'saved', 'autosave'] as CheckpointGroup[]).map(group => {
          const rows = checkpointRows(data.checkpoints!).filter(r => r.group === group);
          return rows.length ? <section className="picker-group" aria-label={groupTitles[group]} key={group}>{checkpointGroups > 1 && <h2>{groupTitles[group]}</h2>}<ul className="start-rows">{rows.map(r =>
            <li key={r.id}><div><div className="start-name">{r.title}</div><div className="start-sub">{r.meta}</div></div><div/>
              <a className="start-btn secondary small" href={`?checkpoint=${encodeURIComponent(r.id)}`} aria-label={`${s.open} ${r.title}`}>{s.open}</a></li>)}</ul></section> : null;
        })}</section>}
      <section className="start-sec" aria-labelledby="start-released"><header><h2 id="start-released">{s.released} {data.datasets && <span>{s.notPrepared(lists.released.length)}</span>}</h2></header>
        <ul className="start-rows">{data.datasets === null ? <li><div className="start-sub">{s.releasedFailed}</div></li> : lists.released.length ? lists.released.map(d => <li key={d.adminDatasetId}>
          <div><div className="start-name">{d.name} <span className="start-tag">{s.newTag}</span></div><div className="start-sub">{client ? s.fromLab : d.client}</div></div>
          <div className="start-state">{s.releasedWhen(when(d.releasedAt, now))} · {d.canPrepare ? s.oneStep : s.labFirst}</div>
          {d.canPrepare && readOnly ? <span className="start-waiting">{s.prepareElsewhere}</span> : d.canPrepare ? <button type="button" className="start-btn secondary small" aria-label={`${s.prepare} ${d.name}`} onClick={() => onPrepareDataset(d.adminDatasetId)}>{s.prepare}</button>
            : <span className="start-waiting">{s.waiting}</span>}</li>) : <li><div className="start-sub">{s.nothingWaiting}</div></li>}</ul></section>
      {uploadLine}{importLine}</>}
  </div></div>;
}
export function StartScreen({ view, onOpenProject, onPrepareDataset, onImportCheckpoint }: { view: AdminView | null; onOpenProject(projectId: string): void; onPrepareDataset(adminDatasetId: string): void; onImportCheckpoint(): void }) {
  const [data, setData] = useState<StartData>(), [filter, setFilter] = useState('all'), [uploading, setUploading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void loadStart({ listProjects: () => listProjects(controller.signal), listDatasets: () => listDatasets(controller.signal), getCheckpoints }).then(value => { if (!controller.signal.aborted) setData(value); });
    return () => controller.abort();
  }, []);
  // The Excel upload (ENTRY-6) once the lists said whether this person prepares; its new upload-<uuid> goes to Prepare.
  return <><StartView view={view} data={data} filter={filter} now={new Date()} canImport={uploadAllowed(view, isReadOnly())} canUpload={!!data && datasetUploadAllowed(view, knownMembersPrepare(), isReadOnly())} readOnly={isReadOnly()} me={adminUserId()} clientNames={knownClientNames()}
    onFilter={setFilter} onOpenProject={onOpenProject} onPrepareDataset={onPrepareDataset} onImportCheckpoint={onImportCheckpoint} onUploadDataset={() => setUploading(true)}/>
    {uploading && <UploadDataset onCancel={() => setUploading(false)} onUploaded={id => { setUploading(false); onPrepareDataset(id); }}/>}</>;
}
