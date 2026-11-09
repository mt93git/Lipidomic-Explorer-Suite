import { notify } from './model';
import { strings as s } from './strings';
export function TopBar({projectName,onCheckpoints,saveText,saveStatus,saveFailure='',onRetrySave,onReopen,nearLimit=false}:{projectName:string;onCheckpoints:()=>void;saveText:string;saveStatus:string;saveFailure?:string;onRetrySave?:()=>void;onReopen?:()=>void;nearLimit?:boolean}) {
  return <header className="topbar"><span className="logo" aria-hidden="true">{s.logo}</span><h1 className="app-name">{s.app}</h1>
    <button className="project" title={s.checkpointsTitle} onClick={onCheckpoints}>{projectName} ▾</button>
    <nav aria-label={s.steps}><a href="/team/">{s.data}</a><a href="/team/">{s.review}</a><span aria-current="step">{s.canvas}</span></nav>
    {/* Small fixes item 4: a lost session is not retried; the pill says so and offers Reopen (edits kept). */}
    {saveStatus === 'error' && onReopen ? <><span className="save-pill" data-state={saveStatus} role="status" title={saveFailure || undefined}>{saveText}</span><button type="button" className="save-reopen" aria-label={s.reopenSessionLabel} data-tip={s.reopenSessionLabel} onClick={onReopen}>{s.reopenSession}</button></>
      : saveStatus === 'error' && onRetrySave ? <button type="button" className="save-pill" data-state={saveStatus} title={saveFailure || undefined} aria-label={`${saveText}. ${s.retrySave}`} onClick={onRetrySave}>{saveText}</button>
      : <span className="save-pill" data-state={saveStatus} role="status">{saveStatus === 'idle' ? s.ready : saveText}</span>}
    {nearLimit && <span className="records-warning" role="status" title={s.recordsNearLimitHelp}>{s.recordsNearLimit}</span>}
    <button className="avatar" aria-label={s.accountLabel} data-tip={s.accountLabel} onClick={() => notify(s.account)}><svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.3 2.7-5 6-5s6 1.7 6 5"/></svg></button>
  </header>;
}
