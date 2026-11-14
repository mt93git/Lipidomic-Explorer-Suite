import type { Injection } from "@/lib/batch";
import { plateMap } from "@/lib/batch-builder";
import { colourSlots, orderOf } from "@/lib/visual-map";
import styles from "./visual-map.module.css";

type Row = Injection & { orderCode?: string | null; status?: string };

// The 96-well plate as the bench loads it: round wells, each order in its own colour, pooled QC violet, blanks dashed.
// Each well shows its injection number; hover or a screen reader gives the well, the name and the order. On a running
// batch a failed injection is ringed red and a skipped one fades. `clients` (order code → client name) adds the
// client to the legend. Wells follow the final injection order (see src/lib/batch/README.md).
export function PlateMap({ injections, clients }: { injections: readonly Row[]; clients?: ReadonlyMap<string, string> }) {
  const grid = plateMap(injections);
  const byVial = new Map(injections.map(row => [row.vial, row]));
  const orders = colourSlots(injections.map(orderOf));
  const tone = (row: Row) => {
    if (row.sample_type === "Quality Control") return styles.qc;
    if (row.sample_type === "Blank") return `${styles.blank} ${styles.dashed}`;
    const order = orderOf(row);
    return order !== null ? styles[`c${orders.get(order) ?? 0}`] : styles.c7;
  };
  const counts = new Map<string, number>();
  for (const row of injections) { const order = orderOf(row); if (order) counts.set(order, (counts.get(order) ?? 0) + 1); }
  const hasQc = injections.some(row => row.sample_type === "Quality Control");
  const hasBlank = injections.some(row => row.sample_type === "Blank");
  return <>
    <div className={styles.scroll} role="region" aria-label="Plate map" tabIndex={0}>
      <table className={styles.map} aria-label="Plate 1 map">
        <thead><tr><td aria-hidden="true" />{grid[0].map((_, column) => <th key={column} scope="col">{column + 1}</th>)}</tr></thead>
        <tbody>{grid.map(row => <tr key={row[0].vial}>
          <th scope="row">{row[0].vial[0]}</th>
          {row.map(cell => {
            const injection = byVial.get(cell.vial);
            if (!injection) return <td key={cell.vial} className={styles.well} aria-label={`${cell.vial}: empty`}><span>{cell.vial}</span></td>;
            const order = orderOf(injection);
            const state = injection.status === "failed" ? styles.fail : injection.status === "skipped" ? styles.skip : "";
            const label = `${cell.vial}: ${injection.sample_name}${order ? ` (${order})` : ""}, injection ${injection.seq}${injection.status && injection.status !== "planned" ? `, ${injection.status}` : ""}`;
            return <td key={cell.vial} className={styles.well} title={label} aria-label={label}>
              <span className={`${styles.used} ${tone(injection)} ${state}`}>{injection.sample_type === "Blank" ? "BLK" : injection.sample_type === "Quality Control" ? "QC" : injection.seq}</span>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <ul className={styles.legend} aria-label="Plate map legend">
      {[...orders].map(([order, slot]) => <li key={order}><span className={`${styles.swatch} ${styles.round} ${styles[`c${slot}`]}`} />
        <span className="mono">{order}</span>{clients?.get(order) ? <span className={styles.muted}>· {clients.get(order)}</span> : null}<span className={styles.muted}>· {counts.get(order)}</span></li>)}
      {hasQc && <li><span className={`${styles.swatch} ${styles.round} ${styles.qc}`} /> Pooled QC</li>}
      {hasBlank && <li><span className={`${styles.swatch} ${styles.dashed} ${styles.round} ${styles.blank}`} /> Blank</li>}
      {injections.some(row => row.status === "failed") && <li><span className={styles.swatch} style={{ background: "var(--danger)" }} /> Failed</li>}
    </ul>
  </>;
}
