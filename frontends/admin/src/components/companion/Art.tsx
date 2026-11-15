import { CELL_ART, CELL_VIEWBOX } from '../../../../shared/companion/art';
/** The neutrophil (frontends/shared/companion/art.ts, the approved proposal's cell), shared with Nexo. */
export function Art() {
  return <svg viewBox={CELL_VIEWBOX} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: CELL_ART }}/>;
}
