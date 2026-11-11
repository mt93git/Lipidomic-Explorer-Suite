import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { openSession, openDatasetSession, confirmDesign, uploadCheckpoint, AdminSignInRequired, knownAdminView, type DatasetSession, type DatasetSettings, type OutlierDecision, type PreparationChoices, type Session } from './api';
import { adminDisplayName, adminHeaders, adminUserId } from './api/adminToken';
import { knownMembersPrepare, listDatasets } from './api/datasetsList';
import type { BoardDecision } from './api/decisions';
import { App } from './ui/App';
import { strings as s, datasetStrings as d } from './ui/strings';
import { datasetTitle } from './ui/datasetPrepare';
import { EntryBar } from './ui/entry/EntryBar';
import { SignInScreen } from './ui/entry/SignInScreen';
import { StartScreen } from './ui/entry/StartScreen';
import { PrepareScreen } from './ui/entry/PrepareScreen';
import { CheckScreen, boardSettings } from './ui/entry/CheckScreen';
import { BoardNotice, decideSettings, noticeStrings } from './ui/entry/BoardNotice';
import { JoinCard } from './ui/entry/JoinCard';
import { fromCanvasV1 } from './state/serialize';
import { initReadOnly, isReadOnly } from './state/readonly';
import { collab, initCollab } from './collab/mode';
import { currentRole, subscribeRole } from './collab/roles';
import './tokens.css';
import './ui/shell.css';
import './ui/entry/entry.css';
type Failed = { kind: 'checkpoint' | 'dataset'; id: string };
// One screen at a time before the board (nexo-entry-build.md "Flow"): signin → start → prepare → check → board. `status` is the
// card that says what is opening, or what failed with Try again.
// `row`: the released dataset's order code and version, Prepare's title ("Prepare ORD041 · v1"); an upload has none.
type Row = { orderCode: string; version: number };
type Check = { name: 'check'; id: string; choices: PreparationChoices; row?: Row; settings: DatasetSettings; session: DatasetSession };
type Screen = { name: 'signin' | 'start' | 'status' } | { name: 'prepare'; id: string; choices: PreparationChoices; row?: Row } | Check;
function Boot() {
  const [session, setSession] = useState<Session | null>(null), [screen, setScreen] = useState<Screen>({ name: 'status' });
  const [message, setMessage] = useState<string>(s.loading), [error, setError] = useState(false), [failed, setFailed] = useState<Failed | null>(null);
  const generation = useRef(0), opening = useRef<AbortController | null>(null);
  const [stalled, setStalled] = useState(false);
  // The opened dataset session's title, and its preparation settings for the board's notice (BoardNotice).
  const [title, setTitle] = useState<string | undefined>(), [prepared, setPrepared] = useState<DatasetSettings | undefined>();
  // The board's dataset, and whether its client lets members prepare (the released dataset's row, or for an uploaded
  // workbook the list's own answer); with the person's role on the project this says who decides a flagged sample.
  const [board, setBoard] = useState<{ id: string; membersPrepare: boolean } | undefined>();
  const [, setRoleSeen] = useState(0), following = useRef<(() => void) | null>(null);
  useEffect(() => subscribeRole(() => setRoleSeen(n => n + 1)), []);
  // Who prepared the board ("Prepared by X"): the project's creator for a joiner, whose board loads behind the join card.
  const [preparedBy, setPreparedBy] = useState<string | undefined>(), [joining, setJoining] = useState<{ settings: DatasetSettings; by: string } | undefined>();
  // One way in for every session, from a checkpoint or a dataset: a v1 canvas becomes the live document before the shell mounts.
  function show(opened: Session) { opened.canvas = opened.canvas ?? {version:'1',libraryHidden:false,nodes:[]}; if (opened.canvas.version === '1') opened.canvas = fromCanvasV1(opened.canvas); setSession(opened); }
  // Signed out of Admin (admin-identity.md): the sign-in screen; any other failure: the status card with its sentence.
  function fail(e: unknown) { setError(true); setMessage(e instanceof Error ? e.message : String(e)); setScreen({ name: e instanceof AdminSignInRequired ? 'signin' : 'status' }); }
  // A refused call on a link (a board being opened) signs in and goes back to it; a bare page just signs in.
  const signedOutFrom = () => failed ? s.yourBoard : undefined;
  function begin(target: Failed, text: string) {
    const ticket = ++generation.current; opening.current?.abort(); const controller = new AbortController(); opening.current = controller; setStalled(false);
    const timeout = window.setTimeout(() => { if (ticket === generation.current) setStalled(true); }, 15000);
    setError(false); setFailed(target); setMessage(text); setScreen({ name: 'status' });
    return { controller, current: () => ticket === generation.current, done: () => clearTimeout(timeout) };
  }
  // The sidecar's projects route (VITE_COLLAB_URL over HTTP).
  function projects(base: string, id?: string) {
    const endpoint = new URL(base, location.href); endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : endpoint.protocol === 'ws:' ? 'http:' : endpoint.protocol;
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/projects${id ? `/${encodeURIComponent(id)}` : ''}`;
    return endpoint;
  }
  // A dataset link that names its project joins it with the preparation its first open chose (FIX-G10); a bare Admin
  // link joins the dataset's project the same way once the sidecar names it (FIX-G12); none: ask.
  type Project = { settings?: DatasetSettings; createdBy?: { displayName: string | null } };
  // The creator's name as Start says it, "the lab" when the sidecar has none.
  const creatorName = (project: Project | undefined) => project && (project.createdBy?.displayName ?? noticeStrings.theLab);
  async function projectSettings(dataset: string): Promise<Project | undefined> {
    const base = import.meta.env.VITE_COLLAB_URL as string | undefined, params = new URLSearchParams(location.search), id = params.get('project');
    if (!base || params.get('collab') === '0') return undefined;
    if (!id) return datasetProject(base, dataset);
    const response = await fetch(projects(base, id).href, { headers: await adminHeaders(undefined, true) });
    if (response.status === 401) throw new AdminSignInRequired();
    return response.ok ? (await response.json()) as Project : undefined;
  }
  // 404 is a first open (Prepare, as before); any other failure also opens as before, never blocked on the sidecar.
  async function datasetProject(base: string, dataset: string): Promise<Project | undefined> {
    try {
      const endpoint = projects(base); endpoint.searchParams.set('dataset', dataset);
      const response = await fetch(endpoint.href, { headers: await adminHeaders(undefined, true) });
      if (!response.ok) return undefined;
      const value = (await response.json()) as Project & { projectId: string };
      const url = new URL(location.href); url.searchParams.set('project', value.projectId); history.replaceState(null, '', url); initCollab();
      return value;
    } catch { return undefined; }
  }
  // Start's row for this dataset, for the bare link too (the 422 does not name it); none when the list cannot load.
  async function releasedRow(id: string): Promise<Row | undefined> {
    try { const row = (await listDatasets()).find(r => r.adminDatasetId === id); return row && { orderCode: row.orderCode, version: row.version }; } catch { return undefined; }
  }
  async function project(origin: Failed, opened: Session, signal: AbortSignal, settings?: DatasetSettings) {
    const base = import.meta.env.VITE_COLLAB_URL as string | undefined;
    const params = new URLSearchParams(location.search);
    // A link that already names a project joins it; only a first open creates one.
    if (!base || params.get('collab') === '0' || params.get('project')) return false;
    const response = await fetch(projects(base).href, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...await adminHeaders(signal, true) },
      // A dataset's project lives in its client's workspace, whoever opens it (plan D3, 2026-11-10).
      body: JSON.stringify({ origin, workspace: opened.projectWorkspace ?? opened.workspace, ...(settings && { settings }) }) });
    if (response.status === 401) throw new AdminSignInRequired();
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? 'Could not open project.');
    if (signal.aborted) return true;
    // The origin stays in the link so the next person opens the same content and joins this project.
    const url = new URL(location.href); url.searchParams.set(origin.kind, origin.id); url.searchParams.set('project', value.projectId);
    history.replaceState(null, '', url); initCollab(); return true;
  }
  async function open(id: string) {
    const attempt = begin({ kind: 'checkpoint', id }, s.opening);
    try { const opened = await openSession(id, attempt.controller.signal); if (!attempt.current()) return; const shared = await project({ kind: 'checkpoint', id }, opened, attempt.controller.signal); if (!attempt.current()) return; setPrepared(undefined); show(opened); if (shared) return; const url = new URL(location.href); url.searchParams.set('checkpoint', id); history.replaceState(null, '', url); }
    catch (e) { if (attempt.current()) fail(e); }
    finally { attempt.done(); }
  }
  // Without settings the API answers with the choices to ask (422): the Prepare screen. With them it opens the prepared session
  // (or takes the one Prepare already opened), creates the project on a first open and shows the board. Failures are thrown.
  // `by`: a joiner's board, prepared by that person (the join card while it opens).
  async function requestDataset(id: string, settings?: DatasetSettings, opened?: DatasetSession, by?: string) {
    const attempt = begin({ kind: 'dataset', id }, settings && !opened ? d.preparing : d.opening);
    setJoining(by && settings ? { settings, by } : undefined);
    try {
      const result = opened ? { status: 'ready' as const, session: opened } : await openDatasetSession(id, settings, attempt.controller.signal); if (!attempt.current()) return;
      if (result.status === 'choices') {
        const { orderCode, version } = result.choices;
        setScreen({ name: 'prepare', id, choices: result.choices, ...(orderCode && version !== undefined && { row: { orderCode, version } }) });
        void releasedRow(id).then(row => { if (row && attempt.current()) setScreen(now => now.name === 'prepare' && now.id === id ? { ...now, row } : now); });
        return;
      }
      // Alone, the board's session is this one: a design confirmed on Prepare is confirmed on it too (with a sidecar, the
      // sidecar's session confirms it from the project's settings, engine.mjs open).
      const design = settings?.design as { unit: string; type: string } | undefined;
      if (design && !collab() && !result.session.design?.confirmed) result.session.design = await confirmDesign(result.session.sessionId, design.unit, design.type).catch(() => result.session.design);
      if (!attempt.current()) return;
      await project({ kind: 'dataset', id }, result.session, attempt.controller.signal, settings); if (!attempt.current()) return;
      const name = datasetTitle(result.session); if (name) document.title = name; setTitle(name); setPrepared(settings);
      setPreparedBy(by ?? adminDisplayName() ?? noticeStrings.theLab); setJoining(undefined); show(result.session);
      setBoard({ id, membersPrepare: false });
      if (knownAdminView() === 'client') void listDatasets().then(rows => { if (attempt.current()) setBoard({ id, membersPrepare: rows.some(r => r.adminDatasetId === id && r.membersPrepare) || (id.startsWith('upload-') && knownMembersPrepare()) }); }, () => {});
      // A shared board's settings follow the project document (meta.origin.settings): a decision reaches every page.
      if (collab()) void import('./collab/session').then(m => { following.current?.(); following.current = m.followSettings(next => { if (next) setPrepared(next); }); });
    } catch (e) { if (attempt.current()) throw e; }
    finally { attempt.done(); }
  }
  async function openDataset(id: string) { try { const project = await projectSettings(id); await requestDataset(id, project?.settings, undefined, creatorName(project)); } catch (e) { fail(e); } }
  // "Open the Canvas": the decisions travel in the project's settings (C3); an exclusion was prepared again on the check
  // (CheckScreen rerun), whose session the board opens on.
  function openCanvas(check: Check, decisions: OutlierDecision[], session?: DatasetSession) {
    void requestDataset(check.id, boardSettings(check.settings, decisions, session), session ?? check.session).catch(fail);
  }
  // Who decides a flagged sample on the board (ENTRY-8's rule, the sidecar's PUT decisions checks the same): lab staff, or
  // a client member whose client prepares, with an editor or owner role on a shared board.
  const role = currentRole()?.role;
  // Deciding re-prepares the board for everyone, so a view-only board (phone layout, ?mode=view; D13) never offers it.
  const canDecide = !isReadOnly() && (knownAdminView() !== 'client' || (!!board?.membersPrepare && (!collab() || role === 'editor' || role === 'owner')));
  // Alone (no sidecar) the board keeps a decision itself, with the settings the sidecar would write; a change of what
  // Team excludes prepares the board again with them, as on the check.
  const removed = (settings: DatasetSettings) => Object.keys(settings.outlierTreatments ?? {}).sort().join();
  async function save(decision: BoardDecision) {
    const next = decideSettings(prepared!, decision, { by: adminUserId() ?? undefined, displayName: adminDisplayName() ?? undefined });
    if (removed(next) === removed(prepared!)) { setPrepared(next); return; }
    setSession(null); await requestDataset(board!.id, next).catch(fail);
  }
  // A project link without its origin (?project=, or Start's Open): the sidecar names the origin and its settings, the link
  // then carries both, and the open joins the project.
  async function openProject(id: string) {
    const base = import.meta.env.VITE_COLLAB_URL as string | undefined;
    if (!base) return picker();
    try {
      const response = await fetch(projects(base, id).href, { headers: await adminHeaders(undefined, true) });
      if (response.status === 401) throw new AdminSignInRequired();
      const value = (await response.json()) as Project & { origin?: Failed | null; error?: string };
      if (!response.ok || !value.origin) throw new Error(value.error ?? 'Could not open project.');
      const url = new URL(location.href); url.searchParams.delete('checkpoint'); url.searchParams.delete('dataset');
      url.searchParams.set(value.origin.kind, value.origin.id); url.searchParams.set('project', id); history.replaceState(null, '', url); initCollab();
      if (value.origin.kind === 'checkpoint') await open(value.origin.id); else await requestDataset(value.origin.id, value.settings, undefined, creatorName(value));
    } catch (e) { fail(e); }
  }
  // Start's Prepare: the page's link becomes the dataset's, as Admin's link would be.
  function prepareDataset(id: string) {
    const url = new URL(location.href); url.searchParams.delete('checkpoint'); url.searchParams.delete('project'); url.searchParams.set('dataset', id);
    history.replaceState(null, '', url); initCollab(); void openDataset(id);
  }
  // Import a Team checkpoint (.zip): the browser's file chooser, then the upload opens as a checkpoint.
  function importCheckpoint() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.zip' });
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      ++generation.current; opening.current?.abort(); setFailed(null); setStalled(false); setError(false); setMessage(s.opening); setScreen({ name: 'status' });
      void uploadCheckpoint(file, file.name.replace(/\.zip$/i, '').slice(0,80)).then(record => open(record.id), fail);
    };
    input.click();
  }
  // Start: only once Admin says the person is signed in (or there is no Admin here); signed out, the sign-in screen.
  async function picker() {
    const ticket = ++generation.current; opening.current?.abort(); setFailed(null); setStalled(false); setError(false); setMessage(s.loading); setScreen({ name: 'status' });
    try { await adminHeaders(undefined, true); if (ticket === generation.current) setScreen({ name: 'start' }); } catch (e) { if (ticket === generation.current) fail(e); }
  }
  const retry = () => failed ? failed.kind === 'checkpoint' ? open(failed.id) : openDataset(failed.id) : picker();
  useEffect(() => { const params = new URLSearchParams(location.search), id = params.get('checkpoint'), dataset = params.get('dataset'), shared = params.get('project'); if (id) void open(id); else if (dataset) void openDataset(dataset); else if (shared) void openProject(shared); else void picker(); }, []);
  if (session) return <App session={session} title={title} notice={prepared && <BoardNotice settings={prepared} preparedBy={preparedBy ?? noticeStrings.theLab}
    projectId={collab()?.project} canDecide={canDecide} save={collab() ? undefined : save}/>}/>;
  // The sign-in page is a whole page with its own bar (ENTRY-5).
  if (screen.name === 'signin') return <SignInScreen onSignedIn={() => void retry()} signedOutFrom={signedOutFrom()}/>;
  const step = screen.name === 'prepare' || screen.name === 'check' ? 'review' : 'data';
  return <div className="entry-page"><EntryBar step={step} account={adminDisplayName()}/>{
    screen.name === 'start' ? <StartScreen view={knownAdminView()} onOpenProject={id => void openProject(id)} onPrepareDataset={prepareDataset} onImportCheckpoint={importCheckpoint}/>
    : screen.name === 'prepare' ? <PrepareScreen dataset={{ adminDatasetId: screen.id, ...screen.row }} choices={screen.choices} onCancel={() => { setError(false); setScreen({ name: 'start' }); }}
        onPrepared={(settings, _sessionId, opened) => setScreen({ name: 'check', id: screen.id, choices: screen.choices, row: screen.row, settings, session: opened })}/>
    : screen.name === 'check' ? <CheckScreen sessionId={screen.session.sessionId} settings={screen.settings} adminDatasetId={screen.id} name={datasetTitle(screen.session)} onOpenCanvas={(decisions, session) => openCanvas(screen, decisions, session)}
        onBack={() => setScreen({ name: 'prepare', id: screen.id, choices: screen.choices, row: screen.row })}/>
    : joining && !error ? <JoinCard settings={joining.settings} preparedBy={joining.by}/>
    : <div className="entry entry-art-matrix"><section className="picker"><h1>{s.app}</h1><p role={error ? 'alert' : 'status'}>{message}</p>
        {(error || stalled) && failed && <button onClick={() => void retry()}>{s.tryAgain}</button>}{(error || stalled) && <button onClick={() => void picker()}>{s.choose}</button>}</section></div>
  }</div>;
}
initReadOnly(); initCollab(); document.documentElement.classList.toggle('read-only', isReadOnly());
createRoot(document.getElementById('app')!).render(<Boot/>);
