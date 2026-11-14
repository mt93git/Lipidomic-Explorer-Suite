import type { Metadata } from "next";
import Link from "@/components/app-link";
import { getProfiles } from "@/lib/data/instrument-profiles";
import { catalogPermissions, datasetTypeLabels, getCatalog, listPanelRates, type Instrument, type PanelRecord } from "@/lib/data/instruments-panels";
import { builderDefaults } from "@/lib/batch-builder";
import { rulesText, settingRows, type InstrumentProfile } from "@/lib/instrument-profiles";
import { formatMoney, type PanelRate } from "@/lib/order-wizard";
import { requireWorkspace } from "@/lib/session";
import { DemoActor } from "../people/demo-actor";
import { ActionForm } from "../release/action-form";
import {
  activateProfileAction, archiveInstrumentAction, archivePanelAction, archiveProfileAction, createInstrumentAction, createPanelAction, createProfileAction,
  saveRulesAction, setRateAction, updateInstrumentAction, updatePanelAction, updateProfileAction,
} from "./actions";
import { HINT, InstrumentFields, PanelFields, ProfileFields, RateFields } from "./fields";
import styles from "./instruments-panels.module.css";

export const metadata: Metadata = { title: "Instruments & panels" };

const PATH = "/instruments-panels";
const done: Record<string, string> = {
  "instrument-created": "Instrument added.", "instrument-saved": "Instrument saved.",
  "instrument-archived": "Instrument archived. Its batches keep it; show archived to see it.",
  "panel-created": "Panel added. New order and Batch builder offer it now.", "panel-saved": "Panel saved.",
  "panel-archived": "Panel archived. Its orders and batches keep it; New order and Batch builder no longer offer it.",
  "profile-created": "Profile added.", "profile-saved": "Profile saved.",
  "profile-activated": "Profile made active. Batch builder starts new batches from its blank and QC rules.",
  "profile-archived": "Profile archived. Show archived to see it.",
  "rules-saved": "Blank and QC rules saved. Batch builder starts new batches from them when this profile is active.",
  "rate-saved": "Rate sheet saved. New order's estimate uses it now.",
};
// show: the profile on screen; profile / panel / instrument: the record whose form is open ("new" for a new one);
// rate: the panel whose rate sheet line is open.
type Query = { archived?: string; show?: string; profile?: string; instrument?: string; panel?: string; rate?: string; done?: string };
type Href = { archived?: boolean; show?: string; profile?: string; instrument?: string; panel?: string; rate?: string };
const href = (query: Href, anchor?: string) => {
  const params = new URLSearchParams();
  if (query.archived) params.set("archived", "1");
  for (const name of ["show", "profile", "instrument", "panel", "rate"] as const) if (query[name]) params.set(name, query[name]!);
  const search = params.toString();
  return `${PATH}${search ? `?${search}` : ""}${anchor ? `#${anchor}` : ""}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
type Actors = Parameters<typeof DemoActor>[0]["actors"];

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

// The prototype's four columns; the instrument is the profile's, so it is not repeated on every row.
function PanelTable({ panels, hidden, edit }: { panels: PanelRecord[]; hidden: number; edit: (id: string) => string | null }) {
  if (!panels.length) return <p className="empty-state">{hidden ? `No active panels. Show archived to see the ${hidden} archived.` : "No panels on this instrument yet."}</p>;
  return <div className={styles.scroll} role="region" aria-label="Panels table" tabIndex={0}><table className={styles.table} aria-label="Panels">
    <thead><tr><th scope="col">Panel</th><th scope="col">LC method</th><th scope="col">ISTD</th><th scope="col">Nexo dataset</th></tr></thead>
    <tbody>{panels.map(panel => <tr key={panel.id} className={panel.archivedAt ? styles.archived : undefined}>
      <NameCell {...panel} edit={panel.archivedAt ? null : edit(panel.id)} />
      <td>{panel.lcMethod ?? "Not set"}</td>
      <td>{panel.istdKits.length ? panel.istdKits.join(" · ") : "None"}</td><td>{datasetTypeLabels[panel.datasetType] ?? panel.datasetType}</td>
    </tr>)}</tbody>
  </table></div>;
}

// The lab's rate sheet (0033): what New order's estimate reads. A part not set is said so; nothing is assumed.
function RateTable({ panels, rates, edit }: { panels: PanelRecord[]; rates: PanelRate[]; edit: (id: string) => string | null }) {
  if (!panels.length) return <p className="empty-state">No active panels to price.</p>;
  return <div className={styles.scroll} role="region" aria-label="Rate sheet table" tabIndex={0}><table className={styles.table} aria-label="Rate sheet">
    <thead><tr><th scope="col">Panel</th><th scope="col">Rate per sample</th><th scope="col">Minutes per injection</th></tr></thead>
    <tbody>{panels.map(panel => {
      const rate = rates.find(item => item.panelId === panel.id);
      return <tr key={panel.id}>
        <td>{edit(panel.id) ? <Link href={edit(panel.id)!} aria-label={`Set the rate for ${panel.name}`}>{panel.name}</Link> : panel.name}</td>
        <td>{rate?.ratePerSample != null && rate.currency ? formatMoney(rate.ratePerSample, rate.currency) : "Not set"}</td>
        <td>{rate?.minutesPerInjection != null ? `${rate.minutesPerInjection} min` : `Not set (estimate uses the batch builder's ${builderDefaults.minutesPerInjection} min)`}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function ArchiveForm({ kind, id, actors, blocked, action }: {
  kind: "instrument" | "panel" | "profile"; id: string; actors: Actors; blocked: string | null; action: typeof archiveInstrumentAction;
}) {
  const kept = { instrument: "Batches keep the instrument they ran on.", panel: "Orders and batches keep this panel; New order and Batch builder stop offering it.", profile: "Its settings and rules stay readable under Show archived." };
  return <div className={styles.archive}>
    <h3>Archive {kind}</h3>
    <p className="muted">{kept[kind]} The record is kept, with your reason.</p>
    {blocked ? <p className="notice">{blocked}</p>
      : <ActionForm action={action} submit={`Archive ${kind}`} pendingLabel="Archiving…" secondary keepValues className={styles.form}>
        <input type="hidden" name="id" value={id} />
        <label className="field"><span className="field-label">Reason</span><input name="reason" required /></label>
        <DemoActor actors={actors} id={`archive-${kind}-actor`} hint="Choose a demo Owner or Admin to archive it." />
      </ActionForm>}
  </div>;
}

function ProfileCard({ profile, canEdit, edit, actors }: { profile: InstrumentProfile; canEdit: boolean; edit: string; actors: Actors }) {
  return <section className={`panel ${styles.card}`} aria-labelledby="profile-title">
    <div className={styles.cardHead}>
      <h2 id="profile-title">{profile.name}</h2>
      <div className={styles.cardActions}>
        {profile.isActive ? <span className={styles.active}>active</span>
          : profile.archivedAt ? <span className={styles.inactive}>archived</span>
          : <span className={styles.inactive}>inactive</span>}
        {canEdit && !profile.archivedAt && <Link href={edit} aria-label={`Edit ${profile.name}`}>Edit</Link>}
      </div>
    </div>
    <div className={styles.cardBody}>
      <div className={styles.scroll} role="region" aria-label="Profile settings table" tabIndex={0}><table className={`${styles.table} ${styles.settings}`} aria-label="Profile settings">
        <thead><tr><th scope="col">Setting</th><th scope="col">Value</th></tr></thead>
        <tbody>{settingRows.map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td className={key === "sampleNamePattern" ? styles.pattern : undefined}>{profile.settings[key] ?? "Not set"}</td></tr>)}</tbody>
      </table></div>
      <p className={styles.caption}>Instrument: {profile.instrumentName ?? "not found"}{profile.archivedAt && ` · Archived · ${profile.archivedReason}`}</p>
      {canEdit && !profile.isActive && !profile.archivedAt && <ActionForm action={activateProfileAction} submit="Make active" pendingLabel="Activating…" secondary className={styles.activate}>
        <input type="hidden" name="id" value={profile.id} />
        <DemoActor actors={actors} id="activate-profile-actor" hint={HINT} />
      </ActionForm>}
    </div>
  </section>;
}

// The four rule boxes: inputs for an Owner or Admin on a live profile, the same boxes as text for everyone else.
function RulesCard({ profile, canEdit, actors }: { profile: InstrumentProfile; canEdit: boolean; actors: Actors }) {
  const { rules } = profile;
  const editable = canEdit && !profile.archivedAt;
  const text = rulesText(rules);
  const note = <p className={styles.rulesNote}>Batch builder starts every new batch from the active profile&apos;s blanks at the start and pooled QC; they can still be changed per batch. Blanks between samples and the QC thresholds are kept here for the bench and QC review; Batch builder does not place blanks between samples.</p>;
  return <section className={`panel ${styles.card} ${styles.rules}`} aria-labelledby="rules-title">
    <div className={styles.cardHead}><h2 id="rules-title">Blank and QC rules</h2></div>
    <div className={styles.cardBody}>
      {editable ? <ActionForm key={profile.id} action={saveRulesAction} submit="Save rules" pendingLabel="Saving…" keepValues className={styles.rulesForm}>
        <input type="hidden" name="id" value={profile.id} />
        <div className={styles.ruleGrid}>
          <fieldset className={styles.rule}><legend>Start of run</legend>
            <div className={styles.ruleBox}>
              <input name="blanksAtStart" type="number" min={0} max={96} step={1} inputMode="numeric" required defaultValue={rules.blanksAtStart} aria-label="Blanks at the start" className={styles.count} />
              <span>blanks (</span><input name="startBlankNote" defaultValue={rules.startBlankNote ?? ""} aria-label="Blank solvent" placeholder="solvent" className={styles.note} /><span>)</span>
            </div>
          </fieldset>
          <fieldset className={styles.rule}><legend>Between samples</legend>
            <div className={styles.ruleBox}>
              <input name="blanksBetween" type="number" min={0} max={96} step={1} inputMode="numeric" defaultValue={rules.blanksBetween} aria-label="Blanks between samples" className={styles.count} />
              <span>blanks after every</span>
              <input name="blanksBetweenEvery" type="number" min={0} max={96} step={1} inputMode="numeric" defaultValue={rules.blanksBetweenEvery} aria-label="Samples between blanks" className={styles.count} />
              <span>samples</span>
            </div>
          </fieldset>
          <fieldset className={styles.rule}><legend>Pooled QC</legend>
            <div className={styles.ruleBox}>
              <span>every</span>
              <input name="pooledQcEvery" type="number" min={0} max={96} step={1} inputMode="numeric" required defaultValue={rules.pooledQcEvery} aria-label="Pooled QC every (samples; 0 for none)" className={styles.count} />
              <span>·</span><input name="pooledQcNote" defaultValue={rules.pooledQcNote ?? ""} aria-label="Pooled QC note" placeholder="note" className={styles.note} />
            </div>
          </fieldset>
          <fieldset className={styles.rule}><legend>QC thresholds</legend>
            <div className={styles.ruleBox}>
              <input name="qcThresholds" defaultValue={rules.qcThresholds ?? ""} aria-label="QC thresholds" placeholder="CV · ISTD · S/N" className={styles.note} />
            </div>
          </fieldset>
        </div>
        <p className={styles.rulesHint}>0 means none: 0 blanks between samples, or a pooled QC every 0 samples.</p>
        {note}
        <DemoActor actors={actors} id="rules-actor" hint={HINT} />
      </ActionForm> : <>
        <dl className={styles.ruleGrid}>
          {([["Start of run", text.start], ["Between samples", text.between], ["Pooled QC", text.pooledQc], ["QC thresholds", text.thresholds]] as const).map(([label, value]) =>
            <div key={label} className={styles.rule}><dt>{label}</dt><dd className={styles.ruleBox}>{value}</dd></div>)}
        </dl>
        {note}
      </>}
    </div>
  </section>;
}

export default async function InstrumentsPanelsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireWorkspace("staff");
  const [catalog, profiles, permissions, query, rates] = await Promise.all([getCatalog(), getProfiles(), catalogPermissions(), searchParams, listPanelRates()]);
  const showArchived = query.archived === "1";
  const { canEdit, demoActors } = permissions;
  const listed = showArchived ? profiles : profiles.filter(item => !item.archivedAt);
  // The profile on screen: the one asked for, else the active one, else the first.
  const shown = listed.find(item => item.id === query.show) ?? listed.find(item => item.isActive) ?? listed[0] ?? null;
  const archivedInstruments = catalog.instruments.filter(item => item.archivedAt).length;
  const archivedCount = archivedInstruments + catalog.panels.filter(item => item.archivedAt).length + profiles.filter(item => item.archivedAt).length;
  const instruments = showArchived ? catalog.instruments : catalog.instruments.filter(item => !item.archivedAt);
  const visiblePanels = showArchived ? catalog.panels : catalog.panels.filter(item => !item.archivedAt);
  // Without a profile the Panels card lists every panel; with one, the panels of its instrument, and the others below.
  const onProfile = (panel: PanelRecord) => !shown || panel.instrumentId === shown.instrumentId;
  const panels = visiblePanels.filter(onProfile);
  const otherPanels = visiblePanels.filter(panel => !onProfile(panel));
  const hiddenPanels = showArchived ? 0 : catalog.panels.filter(item => item.archivedAt && onProfile(item)).length;
  const base: Href = { archived: showArchived, show: shown && shown.id !== listed.find(item => item.isActive)?.id ? shown.id : undefined };
  const editing = {
    instrument: canEdit ? (query.instrument === "new" ? "new" : catalog.instruments.find(item => item.id === query.instrument && !item.archivedAt)) : undefined,
    panel: canEdit ? (query.panel === "new" ? "new" : catalog.panels.find(item => item.id === query.panel && !item.archivedAt)) : undefined,
    profile: canEdit ? (query.profile === "new" ? "new" : profiles.find(item => item.id === query.profile && !item.archivedAt)) : undefined,
    rate: canEdit ? catalog.panels.find(item => item.id === query.rate && !item.archivedAt) : undefined,
  };
  const editRate = (id: string) => canEdit ? href({ ...base, rate: id }, "rate-form") : null;
  const activePanels = catalog.panels.filter(item => !item.archivedAt);
  const editInstrument = (id: string) => canEdit ? href({ ...base, instrument: id }, "instrument-form") : null;
  const editPanel = (id: string) => canEdit ? href({ ...base, panel: id }, "panel-form") : null;
  const back = href(base);
  const { instrument, panel, profile, rate: ratePanel } = editing;

  return <>
    <div className="page-heading">
      <div><div className="eyebrow">Organization / Instruments &amp; panels</div><h1>Instruments &amp; panels</h1>
        <p>Everything instrument-specific lives here, so a second instrument is a new profile, not a new app.</p></div>
      <div className="heading-actions">
        {(showArchived || archivedCount > 0) && <Link className="button secondary" href={href({ archived: !showArchived })}>
          {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
        </Link>}
        {canEdit && <Link className="button" href={href({ ...base, profile: "new" }, "profile-form")}>Add profile</Link>}
      </div>
    </div>
    {!canEdit && <p className="notice" role="status">You can read instrument profiles and panels; adding, editing or archiving them needs a lab Owner or Admin.</p>}
    {query.done && done[query.done] && <p className="notice success" role="status">{done[query.done]}</p>}

    {listed.length > 1 && <nav className={styles.switcher} aria-label="Instrument profiles">
      {listed.map(item => <Link key={item.id} href={href({ archived: showArchived, show: item.id })} aria-current={item.id === shown?.id ? "page" : undefined}>
        {item.name}{item.isActive ? " · active" : item.archivedAt ? " · archived" : ""}
      </Link>)}
    </nav>}

    <div className={styles.top}>
      {shown ? <ProfileCard profile={shown} canEdit={canEdit} edit={href({ ...base, profile: shown.id }, "profile-form")} actors={demoActors} />
        : <section className={`panel ${styles.card}`} aria-labelledby="profile-title">
          <div className={styles.cardHead}><h2 id="profile-title">No instrument profile yet</h2></div>
          <div className={styles.cardBody}><p className="empty-state">{canEdit ? "Add a profile for the lab's instrument: its software, batch file, bench sheet, plates, sample names, results parser and blank and QC rules. Batch builder keeps its usual rules until a profile is active." : "A lab Owner or Admin adds the instrument profile. Batch builder keeps its usual rules until then."}</p></div>
        </section>}
      <section className={`panel ${styles.card}`} aria-labelledby="panels-title">
        <div className={styles.cardHead}><h2 id="panels-title">Panels</h2>
          {canEdit && <div className={styles.cardActions}><Link href={href({ ...base, panel: "new" }, "panel-form")}>Add panel</Link></div>}</div>
        <div className={styles.cardBody}>
          <PanelTable panels={panels} hidden={hiddenPanels} edit={editPanel} />
          {otherPanels.length > 0 && <p className={styles.caption}>On other instruments: {otherPanels.map((item, index) => <span key={item.id}>{index ? ", " : ""}
            {editPanel(item.id) && !item.archivedAt ? <Link href={editPanel(item.id)!} aria-label={`Edit ${item.name}`}>{item.name}</Link> : item.name}
            {` (${item.instrumentName ?? "no instrument"})`}</span>)}</p>}
        </div>
      </section>
    </div>

    {shown && <RulesCard profile={shown} canEdit={canEdit} actors={demoActors} />}

    <section className="panel" id="rate-sheet" aria-labelledby="rates-title"><h2 id="rates-title">Rate sheet</h2>
      <p className="muted">The price per sample and the minutes one injection takes, per active panel (every instrument). New order&apos;s estimate reads them; a rate not set shows as &ldquo;not set&rdquo;, never as a guess. Lab staff only: clients receive the quote from the order.</p>
      <RateTable panels={activePanels} rates={rates} edit={editRate} />
    </section>

    {ratePanel && <section className="panel" id="rate-form" aria-labelledby="rate-form-title">
      <h2 id="rate-form-title">{`Rate for ${ratePanel.name}`}</h2>
      <ActionForm key={ratePanel.id} action={setRateAction} submit="Save rate" pendingLabel="Saving…" keepValues className={styles.form}>
        <RateFields panel={ratePanel} rate={rates.find(item => item.panelId === ratePanel.id) ?? null} actors={demoActors} />
      </ActionForm>
      <Link className={styles.cancel} href={back}>Cancel</Link>
    </section>}

    {profile && <section className="panel" id="profile-form" aria-labelledby="profile-form-title">
      <h2 id="profile-form-title">{profile === "new" ? "New profile" : `Edit ${profile.name}`}</h2>
      {profile === "new" ? <>
        <p className="muted">A new profile starts with Batch builder&apos;s usual rules (1 blank at the start, a pooled QC every 6 samples); set its own below once it is added. The first profile becomes the active one.</p>
        <ActionForm action={createProfileAction} submit="Add profile" pendingLabel="Adding…" keepValues className={`${styles.form} ${styles.formGrid}`}>
          <ProfileFields instruments={catalog.instruments} actors={demoActors} />
        </ActionForm>
      </> : <>
        <ActionForm key={profile.id} action={updateProfileAction} submit="Save profile" pendingLabel="Saving…" keepValues className={`${styles.form} ${styles.formGrid}`}>
          <ProfileFields profile={profile} instruments={catalog.instruments} actors={demoActors} />
        </ActionForm>
        <ArchiveForm kind="profile" id={profile.id} actors={demoActors} action={archiveProfileAction}
          blocked={profile.isActive ? "This is the active profile: Batch builder starts from it. Make another profile active first." : null} />
      </>}
      <Link className={styles.cancel} href={back}>Cancel</Link>
    </section>}

    {panel && <section className="panel" id="panel-form" aria-labelledby="panel-form-title">
      <h2 id="panel-form-title">{panel === "new" ? "New panel" : `Edit ${panel.name}`}</h2>
      {panel === "new" ? <ActionForm action={createPanelAction} submit="Add panel" pendingLabel="Adding…" keepValues className={`${styles.form} ${styles.formGrid}`}>
        <PanelFields instruments={catalog.instruments} actors={demoActors} defaultInstrumentId={shown?.instrumentId} />
      </ActionForm> : <>
        <ActionForm key={panel.id} action={updatePanelAction} submit="Save panel" pendingLabel="Saving…" keepValues className={`${styles.form} ${styles.formGrid}`}>
          <PanelFields panel={panel} instruments={catalog.instruments} actors={demoActors} />
        </ActionForm>
        <ArchiveForm kind="panel" id={panel.id} actors={demoActors} action={archivePanelAction} blocked={null} />
      </>}
      <Link className={styles.cancel} href={back}>Cancel</Link>
    </section>}

    <section className="panel" aria-labelledby="instruments-title">
      <div className="panel-heading"><h2 id="instruments-title">Instruments</h2>
        {canEdit && <Link href={href({ ...base, instrument: "new" }, "instrument-form")}>Add instrument</Link>}</div>
      <p className="muted">The instruments profiles and panels point at; batches record the one they ran on.</p>
      <InstrumentTable instruments={instruments} hidden={showArchived ? 0 : archivedInstruments} edit={editInstrument} />
    </section>

    {instrument && <section className="panel" id="instrument-form" aria-labelledby="instrument-form-title">
      <h2 id="instrument-form-title">{instrument === "new" ? "New instrument" : `Edit ${instrument.name}`}</h2>
      {instrument === "new" ? <ActionForm action={createInstrumentAction} submit="Add instrument" pendingLabel="Adding…" keepValues className={styles.form}>
        <InstrumentFields actors={demoActors} />
      </ActionForm> : <>
        <ActionForm key={instrument.id} action={updateInstrumentAction} submit="Save instrument" pendingLabel="Saving…" keepValues className={styles.form}>
          <InstrumentFields instrument={instrument} actors={demoActors} />
        </ActionForm>
        <ArchiveForm kind="instrument" id={instrument.id} actors={demoActors} action={archiveInstrumentAction}
          blocked={instrument.activePanels ? `${plural(instrument.activePanels, "active panel")} use${instrument.activePanels === 1 ? "s" : ""} this instrument. Archive them or move them to another instrument first.` : null} />
      </>}
      <Link className={styles.cancel} href={back}>Cancel</Link>
    </section>}
  </>;
}
