import { strings as s } from './strings';
import { isReadOnly } from '../state/readonly';
// Journey review 6.3: the hint follows the mode (Draft or Figure page).
// Notices are the toast's alone (review R15: the band repeated each one, and screen readers heard it twice).
// View only has no band: the banner explains the mode.
// A dataset session leads with what was prepared (76 lipids · 5 samples); a checkpoint session has no summary.
export function StatusBand({figureMode=false, summary}:{figureMode?:boolean; summary?:string}) { if (isReadOnly()) return null; return <div className="status-band">{summary && <span className="dataset-summary">{summary}</span>}<span>{figureMode ? s.figureHint : s.hint}</span></div>; }
