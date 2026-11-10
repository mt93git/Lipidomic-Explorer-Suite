import type { Injection } from "@/lib/batch";
import { plateMap } from "@/lib/batch-builder";
import styles from "./batch-plan.module.css";

const tone = { Unknown: styles.unknown, Blank: styles.blank, "Quality Control": styles.qc } as const;

// The 96-well plate as the bench loads it: each cell shows the injection number; hover or screen reader gives the
// well and the name. Wells follow the final injection order (see src/lib/batch/README.md).
export function PlateMap({ injections }: { injections: readonly Injection[] }) {
  const grid = plateMap(injections);
  return <>
    <div className={styles.scroll} role="region" aria-label="Plate map" tabIndex={0}>
      <table className={styles.plate} aria-label="Plate 1 map">
        <thead><tr><td aria-hidden="true" style={{ border: 0, background: "none" }} />{grid[0].map((_, column) => <th key={column} scope="col">{column + 1}</th>)}</tr></thead>
        <tbody>{grid.map(row => <tr key={row[0].vial}>
          <th scope="row">{row[0].vial[0]}</th>
          {row.map(cell => <td key={cell.vial} className={cell.type ? tone[cell.type] : undefined} title={cell.name ? `${cell.vial} · ${cell.name}` : cell.vial}
            aria-label={cell.name ? `${cell.vial}: ${cell.name}, injection ${cell.seq}` : `${cell.vial}: empty`}>{cell.seq ?? ""}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <ul className={styles.legend} aria-label="Plate map legend">
      <li><span className={`${styles.swatch} ${styles.unknown}`} /> Sample</li>
      <li><span className={`${styles.swatch} ${styles.blank}`} /> Blank</li>
      <li><span className={`${styles.swatch} ${styles.qc}`} /> Pooled QC</li>
    </ul>
  </>;
}
