import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { getCheckpoints, openSession, openDatasetSession, uploadCheckpoint, AdminSignInRequired, adminSignInUrl, knownAdminView, type DatasetSettings, type PreparationChoices, type Session } from './api';
import { uploadAllowed } from './ui/uploadAccess';
import { App } from './ui/App';
import { strings as s, datasetStrings as d } from './ui/strings';
import { checkpointRows, groupTitles, type CheckpointGroup, type CheckpointRow } from './ui/checkpointList';
import { PrepareDatasetDialog } from './ui/Dialogs/PrepareDatasetDialog';
import { datasetTitle } from './ui/datasetPrepare';
const groups = (rows: CheckpointRow[]) => rows.reduce<[CheckpointGroup, CheckpointRow[]][]>((out, r) => { const last = out[out.length - 1]; if (last?.[0] === r.group) last[1].push(r); else out.push([r.group, [r]]); return out; }, []);
import { fromCanvasV1 } from './state/serialize';
import { initReadOnly, isReadOnly } from './state/readonly';
import './tokens.css';
import './ui/shell.css';
type Failed = { kind: 'checkpoint' | 'dataset'; id: string };
function Boot() {
  const [session, setSession] = useState<Session | null>(null), [checkpoints, setCheckpoints] = useState<Awaited<ReturnType<typeof getCheckpoints>>>([]);
  const [message, setMessage] = useState<string>(s.loading), [error, setError] = useState(false), [failed, setFailed] = useState<Failed | null>(null);
  const generation = useRef(0), opening = useRef<AbortController | null>(null);
  const [stalled, setStalled] = useState(false), [uploading, setUploading] = useState(false);
  // Signed out of Admin (admin-identity.md): with a failed dataset or checkpoint call, a link to Admin's sign-in that comes back to this page.
  const [signIn, setSignIn] = useState(false);
  // An Admin dataset (?dataset=<uuid>): the choices Team asked for, in the Prepare dataset dialog until confirmed or cancelled; the opened session's title.
  const [prepare, setPrepare] = useState<{ id: string; choices: PreparationChoices; open: boolean } | null>(null), [title, setTitle] = useState<string | undefined>();
  // One way in for every session, from a checkpoint or a dataset: a v1 canvas becomes the live document before the shell mounts.
  function show(opened: Session) { opened.canvas = opened.canvas ?? {version:'1',libraryHidden:false,nodes:[]}; if (opened.canvas.version === '1') opened.canvas = fromCanvasV1(opened.canvas); setSession(opened); }
  function begin(target: Failed, text: string) {
    const ticket = ++generation.current; opening.current?.abort(); const controller = new AbortController(); opening.current = controller; setStalled(false);
    const timeout = window.setTimeout(() => { if (ticket === generation.current) setStalled(true); }, 15000);
    setError(false); setSignIn(false); setFailed(target); setCheckpoints([]); setMessage(text);
    return { controller, current: () => ticket === generation.current, done: () => clearTimeout(timeout) };
  }
  async function open(id: string) {
    const attempt = begin({ kind: 'checkpoint', id }, s.opening);
    try { const opened = await openSession(id, attempt.controller.signal); if (!attempt.current()) return; show(opened); const url = new URL(location.href); url.searchParams.set('checkpoint', id); history.replaceState(null, '', url); }
    catch (e) { if (attempt.current()) { setError(true); setSignIn(e instanceof AdminSignInRequired); setMessage(e instanceof Error ? e.message : String(e)); } }
    finally { attempt.done(); }
  }
  // Without settings the API answers with the choices to ask (422); with them it opens the prepared session, shown as a checkpoint
  // session is. Failures are thrown: the start page shows a failed first ask, the dialog shows a preparation Team refused.
  async function requestDataset(id: string, settings?: DatasetSettings) {
    const attempt = begin({ kind: 'dataset', id }, settings ? d.preparing : d.opening);
    try {
      const result = await openDatasetSession(id, settings, attempt.controller.signal); if (!attempt.current()) return;
      if (result.status === 'choices') { setPrepare({ id, choices: result.choices, open: true }); setMessage(d.title); return; }
      const name = datasetTitle(result.session); if (name) document.title = name; setTitle(name); setPrepare(null); show(result.session);
    } catch (e) { if (attempt.current()) throw e; }
    finally { attempt.done(); }
  }
  async function openDataset(id: string) { setSignIn(false); try { await requestDataset(id); } catch (e) { setError(true); setSignIn(e instanceof AdminSignInRequired); setMessage(e instanceof Error ? e.message : String(e)); } }
  // Cancel leaves nothing open: the start page, with the dataset one click away and the checkpoints to choose from.
  function cancelDataset() { if (!prepare) return; setPrepare({ ...prepare, open: false }); setStalled(false); setMessage(d.cancelled); const ticket = ++generation.current; void getCheckpoints().then(list => { if (ticket === generation.current) setCheckpoints(list); }).catch(() => {}); }
  async function picker() { const ticket = ++generation.current; opening.current?.abort(); setFailed(null); setStalled(false); setError(false); setSignIn(false); setMessage(s.loading); try { const list = await getCheckpoints(); if (ticket !== generation.current) return; setCheckpoints(list); setMessage(list.length ? s.choose : s.empty); } catch(e) { if (ticket === generation.current) { setError(true); setSignIn(e instanceof AdminSignInRequired); setMessage(e instanceof AdminSignInRequired ? e.message : String(e)); } } }
  const retry = () => failed && (failed.kind === 'checkpoint' ? open(failed.id) : openDataset(failed.id));
  useEffect(() => { const params = new URLSearchParams(location.search), id = params.get('checkpoint'), dataset = params.get('dataset'); if (id) void open(id); else if (dataset) void openDataset(dataset); else void picker(); }, []);
  return session ? <App session={session} title={title}/> : <><section className="picker"><h1>{s.app}</h1><p role={error ? 'alert' : 'status'}>{message}</p>{error && signIn && <a className="primary sign-in" href={adminSignInUrl(location.href)}>{d.signIn}</a>}{prepare && !prepare.open && <button onClick={() => setPrepare({ ...prepare, open: true })}>{d.prepareAgain}</button>}{uploadAllowed(knownAdminView(), isReadOnly()) && <label>{s.uploadZip}<input type="file" accept=".zip" disabled={uploading} onChange={e => {
    const file = e.target.files?.[0]; if (!file) return;
    ++generation.current; opening.current?.abort(); setFailed(null); setStalled(false); setUploading(true); setError(false); setSignIn(false);
    void uploadCheckpoint(file, file.name.replace(/\.zip$/i, '').slice(0,80)).then(record => open(record.id)).catch(error => { setError(true); setSignIn(error instanceof AdminSignInRequired); setMessage(error instanceof Error ? error.message : String(error)); }).finally(() => setUploading(false));
  }}/></label>}{groups(checkpointRows(checkpoints)).map(([group, rows]) => <section key={group} className="picker-group" aria-labelledby={`picker-${group}`}><h2 id={`picker-${group}`}>{groupTitles[group]}</h2>{rows.map(r => <button key={r.id} className="picker-row" onClick={() => void open(r.id)}><span className="picker-title">{r.title}</span>{r.meta && <small>{r.meta}</small>}</button>)}</section>)}{(error || stalled) && failed && <button onClick={() => void retry()}>{s.tryAgain}</button>}{(error || stalled) && <button onClick={() => void picker()}>{s.choose}</button>}</section>
  {prepare?.open && <PrepareDatasetDialog choices={prepare.choices} onCancel={cancelDataset} onConfirm={settings => requestDataset(prepare.id, settings)}/>}</>;
}
initReadOnly(); document.documentElement.classList.toggle('read-only', isReadOnly());
createRoot(document.getElementById('app')!).render(<Boot/>);
