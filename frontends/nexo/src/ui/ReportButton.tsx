import { useState } from 'react';
import { Icon } from './Icon';
import { strings as s } from './strings';
/** One click: busy while the report builds, a failure message if it does not. */
export async function startReport(run: () => Promise<void>, setBusy: (busy: boolean) => void, fail: (action: string, error: unknown) => void) {
  setBusy(true);
  try { await run(); } catch (error) { fail(s.failReport, error); } finally { setBusy(false); }
}
/** "Export report" in the canvas toolbar: the report PDF (title, date, Figure 1 and the figure page, A4). */
export function ReportButton({ onExport, disabled = false, onFail = () => {} }: { onExport: () => Promise<void>; disabled?: boolean; onFail?: (action: string, error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" className="report-export" disabled={disabled || busy} aria-busy={busy || undefined} onClick={() => void startReport(onExport, setBusy, onFail)}><Icon name="download"/>{busy ? s.buildingReport : s.exportReport}</button>;
}
