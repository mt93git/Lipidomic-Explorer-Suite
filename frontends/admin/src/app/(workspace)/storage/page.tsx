import type { Metadata } from "next";
import Link from "@/components/app-link";
import { aliquotPlans, listBox, listBoxes, listUnplaced, searchAliquots, storageAccess } from "@/lib/data/storage";
import { formatLabInstant } from "@/lib/lab-time";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { ALIQUOT_CODE, describeLocation, normalizeSearch, type AliquotPlans, type StoredAliquot } from "@/lib/storage";
import { AliquotForm, type AliquotAction } from "./aliquot-form";
import styles from "./storage.module.css";
import map from "@/components/visual-map.module.css";
import { boxGrid, colourSlots, normalPosition } from "@/lib/visual-map";

export const metadata: Metadata = { title: "Storage" };
type Params = { q?: string; box?: string; slot?: string; act?: string; aliquot?: string; done?: string };

// The screen's URL keeps what is open: ?q= a search, ?box= one box, ?slot= its selected position, ?act=&aliquot= one aliquot's form, ?done= the
// confirmation after an action.
function href(params: Params, change: Params = {}, hash = ""): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ q: params.q, box: params.box, slot: params.slot, ...change })) if (value) query.set(key, value);
  const search = query.toString();
  return `/storage${search ? `?${search}` : ""}${hash}`;
}

function AliquotLinks({ item, params }: { item: StoredAliquot; params: Params }) {
  const actions: [AliquotAction, string][] = item.location ? [["move", "Move"], ["remove", "Remove"]] : item.archivedReason ? [] : [["place", "Place"]];
  return <span className={styles.links}>{actions.map(([act, label]) =>
    <Link key={act} href={href(params, { act, aliquot: item.code }, "#act")} aria-label={`${label} ${item.code}`}>{label}</Link>)}</span>;
}

// columns: what the table shows besides the aliquot; links only for a lab writer.
type Column = "position" | "location" | "placed";
function AliquotTable({ items, label, columns, params, canWrite }: { items: StoredAliquot[]; label: string; columns: Column[]; params: Params; canWrite: boolean }) {
  return <div className={styles.scroll} role="region" aria-label={label} tabIndex={0}><table className={styles.table} aria-label={label}>
    <thead><tr>
      {columns.includes("position") && <th scope="col">Position</th>}
      <th scope="col">Aliquot</th><th scope="col">Client</th><th scope="col">Order</th>
      {columns.includes("location") && <th scope="col">Location</th>}
      {columns.includes("placed") && <th scope="col">Placed</th>}
      {canWrite && <th scope="col" className={styles.actions}><span className="sr-only">Actions</span></th>}
    </tr></thead>
    <tbody>{items.map(item => <tr key={item.id}>
      {columns.includes("position") && <td className="mono">{item.location?.position}</td>}
      <td className="mono">{item.code}{item.archivedReason && <small className={styles.archived}>Archived: {item.archivedReason}</small>}</td>
      <td className={styles.more}>{item.clientName}</td>
      <td className={styles.more}><Link className="mono" href={`/orders/${item.orderCode}`}>{item.orderCode}</Link></td>
      {columns.includes("location") && <td className={styles.more}>{item.location ? <Link href={href({}, { box: item.location.box })}>{item.location.box}</Link> : "Not in a box"}{item.location ? ` · ${item.location.position}` : ""}</td>}
      {columns.includes("placed") && <td className={styles.more}>{item.location ? formatLabInstant(item.location.placedAt) : ""}</td>}
      {canWrite && <td className={styles.actions}><AliquotLinks item={item} params={params} /></td>}
    </tr>)}</tbody>
  </table></div>;
}

// The open box as the freezer sees it: a grid (9 × 9 or larger), each aliquot coloured by its client, the selected
// position ringed. Every cell is a link that selects it (?slot=); the panel beside it says what is there and offers
// Move or Remove. Positions that are not a row letter and column number stay in the list below the map.
// The aliquot at the URL's ?slot= of the open box, if any.
function selectedIn(slots: StoredAliquot[], slot: string | undefined) {
  const name = slot ? normalPosition(slot) : undefined;
  return { name, item: name ? slots.find(item => item.location && normalPosition(item.location.position) === name) : undefined };
}

// a09: Print box map opens the print-friendly page of the open box (and keeps the selected position ringed there).
const printHref = (params: Params) => {
  const query = new URLSearchParams();
  if (params.box) query.set("box", params.box);
  if (params.slot) query.set("slot", params.slot);
  return `/storage/print?${query.toString()}`;
};

function BoxMap({ box, slots, params, canWrite, plans }: { box: string; slots: StoredAliquot[]; params: Params; canWrite: boolean; plans: AliquotPlans | null }) {
  const grid = boxGrid(slots, item => item.location?.position);
  const clients = colourSlots(slots.map(item => item.clientName));
  const { name: selectedName, item: selected } = selectedIn(slots, params.slot);
  return <div className={map.boxLayout}>
    <div>
      <div className={map.scroll} role="region" aria-label={`Map of box ${box}`} tabIndex={0}>
        <table className={map.map} aria-label={`Box ${box} map`}>
          <thead><tr><td aria-hidden="true" />{grid.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{grid.cells.map((row, index) => <tr key={grid.rows[index]}>
            <th scope="row">{grid.rows[index]}</th>
            {row.map(cell => {
              const current = cell.position === selectedName ? "true" : undefined;
              const item = cell.item;
              return <td key={cell.position} className={map.cell}>
                <Link href={href(params, { slot: cell.position })} aria-current={current}
                  className={item ? map[`c${clients.get(item.clientName) ?? 0}`] : map.empty}
                  aria-label={item ? `${cell.position}: ${item.code}, ${item.clientName}` : `${cell.position}: free`} title={item ? `${cell.position} · ${item.code} · ${item.clientName}` : `${cell.position} · free`}>
                  {item ? cell.position : current ? cell.position : ""}
                </Link>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <ul className={map.legend} aria-label="Box map legend">
        {[...clients].map(([client, slot]) => <li key={client}><span className={`${map.swatch} ${map[`c${slot}`]}`} /> {client} <span className={map.muted}>· {slots.filter(item => item.clientName === client).length}</span></li>)}
        <li className={map.muted}>{plural(grid.free, "position")} free</li>
      </ul>
    </div>
    <aside className={map.selected} aria-labelledby="slot-title">
      <h3 id="slot-title">{selectedName ? `Selected · ${selectedName}` : "Select a position"}</h3>
      {!selectedName ? <p>Choose a cell of the map to see the aliquot it holds.</p>
        : selected ? <>
          <dl>
            <div><dt>Aliquot</dt><dd className="mono">{selected.code}</dd></div>
            <div><dt>Sample</dt><dd className="mono">{selected.sampleCode}</dd></div>
            <div><dt>Client</dt><dd>{selected.clientName}</dd></div>
            <div><dt>Order</dt><dd><Link className="mono" href={`/orders/${selected.orderCode}`}>{selected.orderCode}</Link></dd></div>
            {plans?.volumeUl !== null && plans?.volumeUl !== undefined && <div><dt>Volume</dt><dd>{plans.volumeUl} µL</dd></div>}
            <div><dt>Since</dt><dd>{selected.location ? formatLabInstant(selected.location.placedAt) : ""}</dd></div>
            {plans?.nextBatch && <div><dt>Next</dt><dd><Link href={`/batch-run/${plans.nextBatch}`} aria-label={`Batch ${plans.nextBatch}`}>Batch <span className="mono">{plans.nextBatch}</span></Link></dd></div>}
          </dl>
          {canWrite && <div className={map.selectedActions}>
            <Link className="button secondary" href={href(params, { act: "move", aliquot: selected.code }, "#act")}>Move aliquot</Link>
            <Link className="button secondary" href={href(params, { act: "remove", aliquot: selected.code }, "#act")}>Remove</Link>
          </div>}
        </>
        : <p>Position {selectedName} is free.{canWrite ? " Place an aliquot from Waiting for a box below, or move one here." : ""}</p>}
    </aside>
  </div>;
}

function doneText(done: string, item: StoredAliquot | undefined, code: string): string | null {
  if (done === "removed") return `${code} removed from storage. The placement is kept in the history.`;
  if (!item?.location) return null;
  if (done === "placed") return `${code} placed in ${describeLocation(item.location)}.`;
  if (done === "moved") return `${code} moved to ${describeLocation(item.location)}. Its old position is kept in the history.`;
  return null;
}

// What one aliquot's form may do now: Place for an aliquot in no box, Move or Remove for one in a box.
function actProblem(act: AliquotAction, item: StoredAliquot): string | null {
  if (act === "place" && item.location) return `${item.code} is already in ${describeLocation(item.location)}. Move it instead.`;
  if (act === "place" && item.archivedReason) return `${item.code} is archived (${item.archivedReason}); it cannot be placed.`;
  if (act !== "place" && !item.location) return `${item.code} is not in a box. Place it instead.`;
  return null;
}
const actTitles: Record<AliquotAction, string> = { place: "Place", move: "Move", remove: "Remove" };

// Lab staff only. Where each aliquot is: search by sample or aliquot code, the boxes with how many positions are taken,
// one box's positions, and the aliquots of received orders waiting for a box. Lab writers place, move and remove.
export default async function StoragePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const raw = await searchParams;
  const params: Params = { q: normalizeSearch(raw.q) || undefined, box: raw.box?.trim() || undefined, slot: raw.box && raw.slot?.trim() ? raw.slot.trim().slice(0, 12) : undefined };
  const act = raw.act === "place" || raw.act === "move" || raw.act === "remove" ? raw.act : null;
  const code = raw.aliquot && ALIQUOT_CODE.test(raw.aliquot) ? raw.aliquot : null;
  const [{ canWrite }, boxes, unplaced, slots, results, found] = await Promise.all([
    storageAccess(), listBoxes(), listUnplaced(),
    params.box ? listBox(params.box) : Promise.resolve([]),
    params.q ? searchAliquots(params.q) : Promise.resolve([]),
    code && (act || raw.done) ? searchAliquots(code).then(rows => rows.find(row => row.code === code)) : Promise.resolve(undefined),
  ]);
  const done = code && raw.done ? doneText(raw.done, found, code) : null;
  const selected = params.box ? selectedIn(slots, params.slot).item : undefined;
  const plans = selected ? await aliquotPlans(selected) : null;
  const problem = act && found ? actProblem(act, found) : null;
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Storage</div>
        <h1>Storage</h1>
        <p>Which box and position holds each aliquot. A sample gets its aliquot when its batch is saved in <Link href="/batch-builder">Batch builder</Link>: place it here, move it between boxes, remove it when it leaves.</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
        {params.box && slots.length > 0 && <Link className="button" href={printHref(params)}>Print box map</Link>}
      </div>
    </div>

    {done && <p className="notice success" role="status">{done}</p>}

    <section className="panel" aria-labelledby="search-title">
      <h2 id="search-title">Find an aliquot</h2>
      <form className={styles.search} method="get" role="search" aria-label="Find an aliquot">
        {params.box && <input type="hidden" name="box" value={params.box} />}
        <label className="field"><span className="field-label">Sample or aliquot code</span>
          <input name="q" type="search" defaultValue={params.q ?? ""} maxLength={40} placeholder="e.g. ORD044-S003 or ORD044-S003-A1" /></label>
        <button className="button">Search</button>
      </form>
      {params.q && (results.length
        ? <AliquotTable items={results} label={`Aliquots matching ${params.q}`} columns={["location"]} params={params} canWrite={canWrite} />
        : <p className="empty-state">No aliquot matches {params.q}. A sample gets its aliquot when its batch is saved in <Link href="/batch-builder">Batch builder</Link>.</p>)}
    </section>

    {act && code && <section className="panel" id="act" aria-labelledby="act-title">
      <h2 id="act-title">{actTitles[act]} <span className="mono">{code}</span></h2>
      {!found ? <p className="notice">No aliquot {code} was found.</p>
        : !canWrite ? <p className="notice">Only a lab Owner, Admin or Operator may place, move or remove aliquots.</p>
        : problem ? <p className="notice">{problem}</p>
        : <>
          <p className="muted">{found.sampleCode} · {found.clientName} · {found.orderCode} · {found.location ? `now in ${describeLocation(found.location)}` : "not in a box"}</p>
          <AliquotForm key={`${act}-${code}`} action={act} aliquotId={found.id} code={found.code} from={found.location?.box} />
        </>}
      <p className={styles.cancel}><Link href={href(params)}>Cancel</Link></p>
    </section>}

    <section className="panel" aria-labelledby="boxes-title">
      <h2 id="boxes-title">Boxes</h2>
      {boxes.length
        ? <ul className={styles.boxes} aria-label="Boxes">{boxes.map(item => <li key={item.box}>
          <Link href={href({}, { box: item.box })} aria-current={item.box === params.box ? "true" : undefined}>
            <span className="mono">{item.box}</span><small>{plural(item.occupied, "position")} taken</small>
          </Link></li>)}</ul>
        : <p className="empty-state">No aliquot is in a box yet.</p>}
    </section>
    {params.box && <section className="panel" aria-labelledby="box-title">
      <h2 id="box-title">Box <span className="mono">{params.box}</span></h2>
      {slots.length ? <>
        <BoxMap box={params.box} slots={slots} params={params} canWrite={canWrite} plans={plans} />
        <details className={styles.list} open={Boolean(raw.done || act)}>
          <summary>All {plural(slots.length, "position")} as a list</summary>
          <AliquotTable items={slots} label={`Positions in box ${params.box}`} columns={["position", "placed"]} params={params} canWrite={canWrite} />
        </details>
      </> : <p className="empty-state">Box {params.box} holds no aliquot.</p>}
    </section>}

    <section className="panel" aria-labelledby="unplaced-title">
      <h2 id="unplaced-title">Waiting for a box{unplaced.length ? ` · ${unplaced.length}` : ""}</h2>
      <p className="muted">Aliquots that are in no box yet.</p>
      {unplaced.length
        ? <AliquotTable items={unplaced} label="Aliquots waiting for a box" columns={[]} params={params} canWrite={canWrite} />
        : <p className="empty-state">Every aliquot of a received order is in a box.</p>}
    </section>
  </>;
}
