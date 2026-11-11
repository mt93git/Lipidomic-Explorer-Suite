import { Suspense, useState, useSyncExternalStore } from 'react';
import { collab } from '../collab/mode';
import { currentRole, subscribeRole } from '../collab/roles';
import { retryLazy } from './retryLazy';
const Share = retryLazy(() => import('./Dialogs/Share').then(m => ({ default: m.Share })));
const Avatars = retryLazy(() => import('./Presence/Avatars').then(m => ({ default: m.Avatars })));
const CommentsPanel = retryLazy(() => import('./Comments/CommentsPanel').then(m => ({ default: m.CommentsPanel })));
import { signOut } from '../api/adminSignIn';
import { strings as s } from './strings';
import './topBar.css';
export function TopBar({projectName,onCheckpoints,saveText,saveStatus,saveFailure='',onRetrySave,onReopen,nearLimit=false}:{projectName:string;onCheckpoints:()=>void;saveText:string;saveStatus:string;saveFailure?:string;onRetrySave?:()=>void;onReopen?:()=>void;nearLimit?:boolean}) {
  const [accountOpen, setAccountOpen] = useState(false), [sharing, setSharing] = useState(false), role = useSyncExternalStore(subscribeRole, currentRole, currentRole), board = collab();
  return <header className="topbar"><img className="logo" src={`${import.meta.env.BASE_URL}entry/libreros-lab-logo.webp`} alt={s.logo} width="63" height="30"/><h1 className="app-name">{s.app}</h1>
    <button className="project" title={s.checkpointsTitle} onClick={onCheckpoints}>{projectName} ▾</button>{new URLSearchParams(globalThis.location?.search).has('dataset') && <span className="from-admin">{s.fromAdmin}</span>}
    <nav aria-label={s.steps}><a href="/team/">{s.data}</a><a href="/team/">{s.review}</a><span aria-current="step">{s.canvas}</span></nav>
    {/* Small fixes item 4: a lost session is not retried; the pill says so and offers Reopen (edits kept). */}
    {saveStatus === 'error' && onReopen ? <><span className="save-pill" data-state={saveStatus} role="status" title={saveFailure || undefined}>{saveText}</span><button type="button" className="save-reopen" aria-label={s.reopenSessionLabel} data-tip={s.reopenSessionLabel} onClick={onReopen}>{s.reopenSession}</button></>
      : saveStatus === 'error' && onRetrySave ? <button type="button" className="save-pill" data-state={saveStatus} title={saveFailure || undefined} aria-label={`${saveText}. ${s.retrySave}`} onClick={onRetrySave}>{saveText}</button>
      : <span className="save-pill" data-state={saveStatus} role="status">{saveStatus === 'idle' ? s.ready : saveText}</span>}
    {nearLimit && <span className="records-warning" role="status" title={s.recordsNearLimitHelp}>{s.recordsNearLimit}</span>}
    {collab() && <Suspense fallback={null}><Avatars/><CommentsPanel/></Suspense>}
    {board && role?.canShare && <><button onClick={() => setSharing(true)}>{s.share}</button>{sharing && <Suspense fallback={null}><Share board={board} projectName={projectName} onClose={() => setSharing(false)}/></Suspense>}</>}
    <details className="account-menu" onToggle={e => setAccountOpen(e.currentTarget.open)}><summary className="avatar" aria-label={s.accountLabel} data-tip={s.accountLabel}><svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.3 2.7-5 6-5s6 1.7 6 5"/></svg></summary><button type="button" className="account-signout" hidden={!accountOpen} onClick={() => { void signOut().then(() => location.reload()); }}>Sign out</button></details>
  </header>;
}
