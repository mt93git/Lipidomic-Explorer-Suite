import { strings as s } from './strings';
import { useSyncExternalStore, type ReactNode } from 'react';
import { currentRole, subscribeRole } from '../collab/roles';
import { isReadOnly, readOnlyReason } from '../state/readonly';
// Journey review 6.3: the hint follows the mode (Draft or Figure page).
// Notices are the toast's alone (review R15: the band repeated each one, and screen readers heard it twice).
// View only has no band: the banner explains the mode.
// A dataset session leads with what was prepared (76 lipids · 5 samples), for every role; a checkpoint session has no summary.
// `notice`: a dataset board's "Prepared by X · settings" and undecided-sample banner (ui/entry/BoardNotice), for everyone.
export function StatusBand({figureMode=false, summary, notice}:{figureMode?:boolean; summary?:string; notice?:ReactNode}) { const role = useSyncExternalStore(subscribeRole, currentRole, currentRole); if (readOnlyReason() === 'role') return <div className="status-band" role="status">{summary && <span className="dataset-summary">{summary}</span>}<span>{role?.role === 'commenter' ? s.commentRole : s.viewOnlyRole}</span>{notice}</div>; if (isReadOnly()) return notice ? <div className="status-band">{notice}</div> : null; return <div className="status-band">{summary && <span className="dataset-summary">{summary}</span>}{notice}<span>{figureMode ? s.figureHint : s.hint}</span></div>; }
