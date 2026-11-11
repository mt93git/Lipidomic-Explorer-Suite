import type { Metadata } from "next";
import Link from "@/components/app-link";
import { catalogPermissions, datasetTypeLabels, getCatalog, type Instrument, type PanelRecord } from "@/lib/data/instruments-panels";
import { requireWorkspace } from "@/lib/session";
import { DemoActor } from "../people/demo-actor";
import { ActionForm } from "../release/action-form";
import { archiveInstrumentAction, archivePanelAction, createInstrumentAction, createPanelAction, updateInstrumentAction, updatePanelAction } from "./actions";
import { InstrumentFields, PanelFields } from "./fields";
import styles from "./instruments-panels.module.css";

export const metadata: Metadata = { title: "Instruments & panels" };

const PATH = "/instruments-panels";
const done: Record<string, string> = {
  "instrument-created": "Instrument added.", "instrument-saved": "Instrument saved.",
  "instrument-archived": "Instrument archived. Its batches keep it; show archived to see it.",
  "panel-created": "Panel added. New order and Batch builder offer it now.", "panel-saved": "Panel saved.",
  "panel-archived": "Panel archived. Its orders and batches keep it; New order and Batch builder no longer offer it.",
};
type Query = { archived?: string; instrument?: string; panel?: string; done?: string };
const href = (query: { archived?: boolean; instrument?: string; panel?: string }, anchor?: string) => {
  const params = new URLSearchParams();
  if (query.archived) params.set("archived", "1");
  if (query.instrument) params.set("instrument", query.instrument);
  if (query.panel) params.set("panel", query.panel);
  const search = params.toString();
  return `${PATH}${search ? `?${search}` : ""}${anchor ? `#${anchor}` : ""}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function NameCell({ name, archivedAt, archivedReason, edit }: { name: string; archivedAt: string | null; archivedReason: string | null; edit: string | null }) {
  return <td>{edit ? <Link href={edit} aria-label={`Edit ${name}`}>{name}</Link> : name}
    {archivedAt && <span className={styles.reason}>Archived · {archivedReason}</span>}</td>;
}

// hidden: archived records the list is not showing; then "none yet" would be wrong.
function InstrumentTable({ instruments, hidden, edit }: { instruments: Instrument[]; hidden: number; edit: (id: string) => string | null }) {
  if (!instruments.length) return <p className="empty-state">{hidden ? `No active instruments. Show archived to see the ${hidden} archived.` : "No instruments yet."}</p>;
  return <div className={styles.scroll} role="region" aria-label="Instruments table" tabIndex={0}><table className={styles.table} aria-label="Instruments">
    <thead><tr><th scope="col">Instrument</th><th scope="col">Model</th><th scope="col">Serial number</th><th scope="col">Active panels</th></tr></thead>
    <tbody>{instruments.map(instrument => <tr key={instrument.id} className={instrument.archivedAt ? styles.archived : undefined}>
      <NameCell {...instrument} edit={instrument.archivedAt ? null : edit(instrument.id)} />
      <td>{instrument.model ?? "Not set"}</td><td>{instrument.serialNumber ?? "Not set"}</td><td>{instrument.activePanels}</td>
    </tr>)}</tbody>
  </table></div>;
}

function PanelTable({ panels, hidden, edit }: { panels: PanelRecord[]; hidden: number; edit: (id: string) => string | null }) {
  if (!panels.length) return <p className="empty-state">{hidden ? `No active panels. Show archived to see the ${hidden} archived.` : "No panels yet."}</p>;
  return <div className={styles.scroll} role="region" aria-label="Panels table" tabIndex={0}><table className={styles.table} aria-label="Panels">
    <thead><tr><th scope="col">Panel</th><th scope="col">Instrument</th><th scope="col">LC method</th><th scope="col">ISTD kits</th><th scope="col">Dataset type</th><th scope="col">Orders using it</th></tr></thead>
    <tbody>{panels.map(panel => <tr key={panel.id} className={panel.archivedAt ? styles.archived : undefined}>
      <NameCell {...panel} edit={panel.archivedAt ? null : edit(panel.id)} />
      <td>{panel.instrumentName ?? "No instrument"}</td><td>{panel.lcMethod ?? "Not set"}</td>
      <td>{panel.istdKits.length ? panel.istdKits.join(", ") : "None"}</td><td>{datasetTypeLabels[panel.datasetType] ?? panel.datasetType}</td><td>{panel.orderCount}</td>
    </tr>)}</tbody>
  </table></div>;
}

function ArchiveForm({ kind, id, actors, blocked, action }: {
  kind: "instrument" | "panel"; id: string; actors: Parameters<typeof DemoActor>[0]["actors"]; blocked: string | null; action: typeof archiveInstrumentAction;
}) {
  return <div className={styles.archive}>
    <h3>Archive {kind}</h3>
    <p className="muted">{kind === "instrument" ? "Batches keep the instrument they ran on." : "Orders and batches keep this panel; New order and Batch builder stop offering it."} The record is kept, with your reason.</p>
    {blocked ? <p className="notice">{blocked}</p>
      : <ActionForm action={action} submit={`Archive ${kind}`} pendingLabel="Archiving…" secondary keepValues className={styles.form}>
        <input type="hidden" name="id" value={id} />
        <label className="field"><span className="field-label">Reason</span><input name="reason" required /></label>
        <DemoActor actors={actors} id={`archive-${kind}-actor`} hint="Choose a demo Owner or Admin to archive it." />
      </ActionForm>}
  </div>;
}

export default async function InstrumentsPanelsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireWorkspace("staff");
  const [catalog, permissions, query] = await Promise.all([getCatalog(), catalogPermissions(), searchParams]);
  const showArchived = query.archived === "1";
  const archivedInstruments = catalog.instruments.filter(item => item.archivedAt).length;
  const archivedPanels = catalog.panels.filter(item => item.archivedAt).length;
  const archivedCount = archivedInstruments + archivedPanels;
  const instruments = showArchived ? catalog.instruments : catalog.instruments.filter(item => !item.archivedAt);
  const panels = showArchived ? catalog.panels : catalog.panels.filter(item => !item.archivedAt);
  const { canEdit, demoActors } = permissions;
  const editing = {
    instrument: canEdit ? catalog.instruments.find(item => item.id === query.instrument && !item.archivedAt) : undefined,
    panel: canEdit ? catalog.panels.find(item => item.id === query.panel && !item.archivedAt) : undefined,
  };
  const editInstrument = (id: string) => canEdit ? href({ archived: showArchived, instrument: id }, "instrument-form") : null;
  const editPanel = (id: string) => canEdit ? href({ archived: showArchived, panel: id }, "panel-form") : null;
  const back = href({ archived: showArchived });
  const instrument = editing.instrument;
  const panel = editing.panel;
  // Without the forms (a reader) each table takes the full width.
  const layout = canEdit ? styles.layout : `${styles.layout} ${styles.reading}`;

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">Organization / Instruments &amp; panels</div><h1>Instruments &amp; panels</h1>
        <p>The lab&apos;s instruments and the assay panels New order and Batch builder offer. A panel&apos;s dataset type decides how its results are read.</p></div>
      {(showArchived || archivedCount > 0) && <div className="heading-actions">
        <Link className="button secondary" href={href({ archived: !showArchived })}>
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </Link>
      </div>}
    </div>
    {!canEdit && <p className="notice" role="status">You can read instruments and panels; adding, editing or archiving them needs a lab Owner or Admin.</p>}
    {query.done && done[query.done] && <p className="notice success" role="status">{done[query.done]}</p>}

    <div className={layout}>
      <section className="panel" aria-labelledby="instruments-title"><h2 id="instruments-title">Instruments</h2>
        <InstrumentTable instruments={instruments} hidden={showArchived ? 0 : archivedInstruments} edit={editInstrument} />
      </section>
      {canEdit && <section className="panel" id="instrument-form" aria-labelledby="instrument-form-title">
        <h2 id="instrument-form-title">{instrument ? `Edit ${instrument.name}` : "New instrument"}</h2>
        {instrument ? <>
          <ActionForm key={instrument.id} action={updateInstrumentAction} submit="Save instrument" pendingLabel="Saving…" keepValues className={styles.form}>
            <InstrumentFields instrument={instrument} actors={demoActors} />
          </ActionForm>
          <Link className={styles.cancel} href={back}>Cancel</Link>
          <ArchiveForm kind="instrument" id={instrument.id} actors={demoActors} action={archiveInstrumentAction}
            blocked={instrument.activePanels ? `${plural(instrument.activePanels, "active panel")} use${instrument.activePanels === 1 ? "s" : ""} this instrument. Archive them or move them to another instrument first.` : null} />
        </> : <ActionForm action={createInstrumentAction} submit="Add instrument" pendingLabel="Adding…" keepValues className={styles.form}>
          <InstrumentFields actors={demoActors} />
        </ActionForm>}
      </section>}
    </div>

    <div className={layout}>
      <section className="panel" aria-labelledby="panels-title"><h2 id="panels-title">Panels</h2>
        <PanelTable panels={panels} hidden={showArchived ? 0 : archivedPanels} edit={editPanel} />
      </section>
      {canEdit && <section className="panel" id="panel-form" aria-labelledby="panel-form-title">
        <h2 id="panel-form-title">{panel ? `Edit ${panel.name}` : "New panel"}</h2>
        {panel ? <>
          <ActionForm key={panel.id} action={updatePanelAction} submit="Save panel" pendingLabel="Saving…" keepValues className={styles.form}>
            <PanelFields panel={panel} instruments={catalog.instruments} actors={demoActors} />
          </ActionForm>
          <Link className={styles.cancel} href={back}>Cancel</Link>
          <ArchiveForm kind="panel" id={panel.id} actors={demoActors} action={archivePanelAction} blocked={null} />
        </> : <ActionForm action={createPanelAction} submit="Add panel" pendingLabel="Adding…" keepValues className={styles.form}>
          <PanelFields instruments={catalog.instruments} actors={demoActors} />
        </ActionForm>}
      </section>}
    </div>
  </>;
}
