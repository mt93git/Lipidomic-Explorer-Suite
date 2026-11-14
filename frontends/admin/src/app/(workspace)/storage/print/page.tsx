import type { Metadata } from "next";
import Link from "@/components/app-link";
import map from "@/components/visual-map.module.css";
import { listBox } from "@/lib/data/storage";
import { formatLabInstant } from "@/lib/lab-time";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { boxGrid, colourSlots, normalPosition } from "@/lib/visual-map";
import { PrintButton } from "./print-button";
import styles from "./print.module.css";

export const metadata: Metadata = { title: "Print box map" };
type Params = { box?: string; slot?: string };

// a09 "Print box map": one box on paper. A header with the box and when it was printed (lab time), the grid with each
// aliquot's code in its cell coloured by client, the legend with the free count, and every position as a list. On screen
// it has a Print button and a way back; printed, the app's bar, sidebar and those buttons are hidden (print.module.css).
// Lab staff only, like Storage.
export default async function PrintBoxPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const raw = await searchParams;
  const box = raw.box?.trim() || undefined;
  const slot = box && raw.slot?.trim() ? raw.slot.trim().slice(0, 12) : undefined;
  const back = `/storage${box ? `?${new URLSearchParams({ box, ...(slot ? { slot } : {}) }).toString()}` : ""}`;
  const toolbar = <div className={styles.toolbar}>
    <Link className="button secondary" href={back}>{box ? `← Back to box ${box}` : "← Back to storage"}</Link>
    {box && <PrintButton />}
  </div>;
  if (!box) return <div className={styles.sheet}>{toolbar}<p className="empty-state">Choose a box in Storage first.</p></div>;

  const slots = await listBox(box);
  const printed = formatLabInstant(new Date().toISOString());
  if (!slots.length) return <div className={styles.sheet}>{toolbar}<h1 className={styles.title}>Box <span className="mono">{box}</span></h1><p className="empty-state">Box {box} holds no aliquot.</p></div>;

  const grid = boxGrid(slots, item => item.location?.position);
  const clients = colourSlots(slots.map(item => item.clientName));
  const selected = slot ? normalPosition(slot) : undefined;
  return <div className={styles.sheet}>
    {toolbar}
    <header className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Lipidomic Explorer Admin · Storage</div>
        <h1 className={styles.title}>Box <span className="mono">{box}</span></h1>
        <p className={styles.meta}>{grid.rows.length} × {grid.columns.length} · {slots.length - grid.offGrid.length} taken · {grid.free} free</p>
      </div>
      <p className={styles.printed}>Printed {printed}</p>
    </header>
    <table className={`${map.map} ${styles.grid}`} aria-label={`Box ${box} map`}>
      <thead><tr><td aria-hidden="true" />{grid.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{grid.cells.map((row, index) => <tr key={grid.rows[index]}>
        <th scope="row">{grid.rows[index]}</th>
        {row.map(cell => <td key={cell.position} aria-current={cell.position === selected ? "true" : undefined}
          className={`${styles.cell} ${cell.item ? map[`c${clients.get(cell.item.clientName) ?? 0}`] : styles.free}`}>
          <span className={styles.position}>{cell.position}</span>
          {cell.item && <span className={styles.code}> {cell.item.code}</span>}
        </td>)}
      </tr>)}</tbody>
    </table>
    <ul className={`${map.legend} ${styles.legend}`} aria-label="Box map legend">
      {[...clients].map(([client, colour]) => <li key={client}><span className={`${map.swatch} ${map[`c${colour}`]}`} aria-hidden="true" />{client} · {slots.filter(item => item.clientName === client).length}</li>)}
      <li className={map.muted}>{plural(grid.free, "position")} free</li>
    </ul>
    <table className={styles.list} aria-label={`Positions in box ${box}`}>
      <thead><tr><th scope="col">Position</th><th scope="col">Aliquot</th><th scope="col">Client</th><th scope="col">Order</th><th scope="col">Since</th></tr></thead>
      <tbody>{slots.map(item => <tr key={item.id}>
        <td className="mono">{item.location?.position}</td><td className="mono">{item.code}</td><td>{item.clientName}</td>
        <td className="mono">{item.orderCode}</td><td>{item.location ? formatLabInstant(item.location.placedAt) : ""}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
