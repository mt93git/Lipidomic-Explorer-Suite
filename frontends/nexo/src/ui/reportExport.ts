import type { CanvasHandle } from '../canvas/handle';
import { tabsBridges } from '../canvas/handle';
import { exportReport } from '../figure/exportPage';
import { initialDocument, syncDocument } from '../figure/model';
import { reportTitle, reportTitlePreference } from '../figure/report';
import type { Document } from '../state/document';
import { strings as s } from './strings';
/** What the report's title block names: the board as the top bar shows it, the dataset, and its counts. */
export interface ReportInfo { projectName?: string; datasetName?: string; samples?: unknown; lipids?: unknown }
/** The toolbar's Export report: the saved figure page (or the default page built from the canvas), titled with the
 *  author's report title, else the board's name, else the dataset's, else "Lipidomics report". */
export async function exportCanvasReport(handle: CanvasHandle | null | undefined, report: ReportInfo | undefined) {
  if (!handle) return;
  const nodes = handle.getSession().canvas.nodes, saved = (tabsBridges.get(handle)?.document() as { document?: Document | null } | undefined)?.document;
  const title = reportTitle({ custom: reportTitlePreference.get(), projectName: report?.projectName, placeholder: s.project, datasetName: report?.datasetName });
  await exportReport(saved ?? syncDocument(initialDocument(), nodes), nodes, { title, samples: report?.samples, lipids: report?.lipids });
}
