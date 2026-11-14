import type { Metadata } from "next";
import Link from "@/components/app-link";
import { ErrorSummary } from "@/components/error-summary";
import { PlateMap } from "@/components/plate-map";
import { SequenceTable } from "@/components/sequence-table";
import { StatTiles } from "@/components/stat-tiles";
import styles from "@/components/batch-plan.module.css";
import { builderDefaults, formatRunTime, parseBuilderForm, planBatch, planKey, PLATE, problemText, type BuilderErrors, type BuilderSample, type BuilderValues } from "@/lib/batch-builder";
import { listBuilderSamples } from "@/lib/data/batches";
import { listPanels } from "@/lib/data/orders";
import { LAB_TIME_ZONE } from "@/lib/lab-time";
import { endsAt } from "@/lib/visual-map";
import { plural } from "@/lib/samples";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../release/action-form";
import { saveBatchAction } from "./actions";

export const metadata: Metadata = { title: "Batch builder" };
type Params = Record<string, string | string[] | undefined>;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const labels: [keyof BuilderErrors, string, string][] = [["panelId", "Panel", "batch-panelId"], ["samples", "Samples", "batch-samples"], ["blanksAtStart", "Blanks at start", "batch-blanksAtStart"],
  ["pooledQcEvery", "Pooled QC every", "batch-pooledQcEvery"], ["minutesPerInjection", "Minutes per injection", "batch-minutesPerInjection"]];

function searchOf(params: Params): URLSearchParams {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) for (const item of [value ?? []].flat()) search.append(name, item);
  return search;
}

// The same fields again, as hidden inputs, for the save form: the action reads them like the preview did.
function Carried({ values }: { values: BuilderValues }) {
  const fields: [string, string | number | boolean][] = [["panelId", values.panelId], ["blanksAtStart", values.blanksAtStart], ["pooledQcEvery", values.pooledQcEvery],
    ["minutesPerInjection", values.minutesPerInjection], ["seed", values.seed], ["plateOrder", values.plateOrder]];
  return <>
    {values.sampleIds.map(id => <input key={id} type="hidden" name="sample" value={id} />)}
    {fields.map(([name, value]) => <input key={name} type="hidden" name={name} value={String(value)} />)}
    {(["blankAfterQc", "qcAtEnd", "randomize"] as const).filter(name => values[name]).map(name => <input key={name} type="hidden" name={name} value="on" />)}
  </>;
}

function groupByOrder(samples: BuilderSample[]) {
  const groups = new Map<string, BuilderSample[]>();
  for (const sample of samples) groups.set(sample.orderCode, [...(groups.get(sample.orderCode) ?? []), sample]);
  return [...groups];
}

// The query string is the whole plan (it keys the form, so a link to ?order=… resets the checkboxes): ?order=ORD042 preselects an order's samples; "Preview sequence" is a GET that adds
// the rules, so a preview can be reloaded or shared. Only "Save planned batch" writes (and plans again on the server).
export default async function BatchBuilderPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireWorkspace("staff");
  const search = searchOf(await searchParams);
  const [samples, panels] = await Promise.all([listBuilderSamples(), listPanels()]);
  const previewing = search.has("preview");
  const parsed = previewing ? parseBuilderForm(search, samples) : null;
  const plan = parsed?.ok ? planBatch(parsed.value, samples) : null;
  const errors = parsed && !parsed.ok ? parsed.errors : {};
  const orders = search.getAll("order");
  const picked = new Set(search.has("sample") || previewing ? search.getAll("sample") : samples.filter(sample => orders.includes(sample.orderCode)).map(sample => sample.id));
  const value = <K extends keyof typeof builderDefaults>(name: K): string => search.get(name) ?? String(builderDefaults[name]);
  const checked = (name: "blankAfterQc" | "qcAtEnd" | "randomize") => previewing ? search.has(name) : builderDefaults[name];
  const byId = new Map(samples.map(sample => [sample.id, sample]));
  const counts = plan && (["Unknown", "Blank", "Quality Control"] as const).map(type => plan.injections.filter(row => row.sample_type === type).length);
  const problem = (field: keyof BuilderErrors) => errors[field] ? <small id={`batch-${field}-error`} className="field-error">{errors[field]}</small> : null;
  const describe = (field: keyof BuilderErrors) => errors[field] ? { "aria-invalid": true as const, "aria-describedby": `batch-${field}-error` } : {};

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / Batch builder</div>
        <h1>Batch builder</h1>
        <p>Pick registered samples, set the blanks, pooled QC and seed, and preview the sequence and plate map. Saving plans the batch; the sequence is exported from the batch page.</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/batch-run">Batch run</Link>
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>

    {!samples.length ? <p className="empty-state">
      <strong>No registered sample is waiting for a batch.</strong>
      Samples appear here once their order is Registered. <Link href="/sample-registry">Open the sample registry</Link> or <Link href="/receive-shipment">receive a shipment</Link>.
    </p> : <form key={search.toString()} method="get" className="record-form" aria-label="Batch plan">
      <ErrorSummary fields={labels.filter(([field]) => errors[field]).map(([, label, id]) => ({ id, label }))} />
      <section className="panel" aria-labelledby="pick-title">
        <div className="panel-heading"><div><div className="eyebrow">Samples</div><h2 id="pick-title">Choose the samples</h2></div>
          <Link className="button secondary" href={`/batch-builder?${groupByOrder(samples).map(([code]) => `order=${code}`).join("&")}`}>Select all</Link></div>
        <div id="batch-samples" tabIndex={-1} aria-describedby={errors.samples ? "batch-samples-error" : undefined}>
          {groupByOrder(samples).map(([code, list]) => <fieldset key={code} className={styles.pickGroup}>
            <legend><span className="mono">{code}</span> · {list[0].clientName} · {plural(list.length, "sample")}</legend>
            <Link href={`/batch-builder?order=${code}`}>Select all of {code}</Link>
            <ul className={styles.pickList}>{list.map(sample => <li key={sample.id}><label>
              <input type="checkbox" name="sample" value={sample.id} defaultChecked={picked.has(sample.id)} />
              <span><span className="mono">{sample.fullName}</span> <small className="muted">{sample.code}</small></span>
            </label></li>)}</ul>
          </fieldset>)}
          {problem("samples")}
        </div>
      </section>

      <section className="panel" aria-labelledby="rules-title">
        <div className="eyebrow">Rules</div>
        <h2 id="rules-title">Blanks, pooled QC and order</h2>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="batch-panelId">Panel</label>
            <select id="batch-panelId" name="panelId" required defaultValue={search.get("panelId") ?? ""} {...describe("panelId")}>
              <option value="">Choose a panel…</option>
              {panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}
            </select>
            {problem("panelId")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="batch-plateOrder">Plate order</label>
            <select id="batch-plateOrder" name="plateOrder" defaultValue={value("plateOrder")}>
              <option value="column-major">Down the columns (A1, B1 … H1, A2 …)</option>
              <option value="row-major">Along the rows (A1, A2 … A12, B1 …)</option>
            </select>
            <small className="field-hint">{PLATE}, 96 wells; blanks and QC take a well too.</small>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="batch-blanksAtStart">Blanks at start</label>
            <input id="batch-blanksAtStart" name="blanksAtStart" type="number" min={0} step={1} inputMode="numeric" defaultValue={value("blanksAtStart")} {...describe("blanksAtStart")} />
            {problem("blanksAtStart")}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="batch-pooledQcEvery">Pooled QC every</label>
            <input id="batch-pooledQcEvery" name="pooledQcEvery" type="number" min={0} step={1} inputMode="numeric" defaultValue={value("pooledQcEvery")} {...describe("pooledQcEvery")} />
            <small className="field-hint">Samples between QC injections; 0 means none.</small>
            {problem("pooledQcEvery")}
          </div>
        </div>
        <div className={styles.checks}>
          <label><input type="checkbox" name="qcAtEnd" defaultChecked={checked("qcAtEnd")} /> Pooled QC at the end</label>
          <label><input type="checkbox" name="blankAfterQc" defaultChecked={checked("blankAfterQc")} /> Blank after every QC</label>
          <label><input type="checkbox" name="randomize" defaultChecked={checked("randomize")} /> Randomize the sample order</label>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="batch-seed">Seed</label>
            <input id="batch-seed" name="seed" className="mono" autoComplete="off" defaultValue={search.get("seed") ?? today()} />
            <small className="field-hint">The same samples and seed always give the same order; it is saved with the batch.</small>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="batch-minutesPerInjection">Minutes per injection</label>
            <input id="batch-minutesPerInjection" name="minutesPerInjection" type="number" min={0.1} step="any" inputMode="decimal" defaultValue={value("minutesPerInjection")} {...describe("minutesPerInjection")} />
            <small className="field-hint">Run time = injections × minutes; loading and equilibration are not counted.</small>
            {problem("minutesPerInjection")}
          </div>
        </div>
        <input type="hidden" name="preview" value="1" />
        <div className="form-actions"><button className="button">Preview sequence</button></div>
      </section>
    </form>}

    {parsed?.ok && plan && !plan.injections.length && <section className="panel" aria-labelledby="preview-title">
      <div className="eyebrow">Preview</div><h2 id="preview-title">The plan cannot be built</h2>
      <p className="error" role="alert">{problemText(plan)}</p>
    </section>}

    {parsed?.ok && plan && plan.injections.length > 0 && counts && <section className="panel" aria-labelledby="preview-title">
      <div className="panel-heading"><div><div className="eyebrow">Preview</div><h2 id="preview-title">{plural(plan.injections.length, "injection")} · {formatRunTime(plan.minutes)}</h2></div>
        <span className="pill pending">Not saved yet</span></div>
      <StatTiles label="Plan summary" tiles={[
        { value: plan.injections.length, label: "injections" }, { value: counts[0], label: "samples" },
        { value: counts[2], label: "pooled QC" }, { value: counts[1], label: "blanks" },
        { value: formatRunTime(plan.minutes), label: "run time" }, { value: endsAt(new Date(), plan.minutes), label: "ends if started now" },
      ]} />
      <p className="muted"><small>Seed <span className="mono">{parsed.value.seed || "(empty)"}</span> · {groupByOrder(samples.filter(sample => parsed.value.sampleIds.includes(sample.id))).length} orders from {new Set(samples.filter(sample => parsed.value.sampleIds.includes(sample.id)).map(sample => sample.clientId)).size} clients</small></p>
      <h3>Plate map</h3>
      <PlateMap injections={plan.injections} clients={new Map(samples.map(sample => [sample.orderCode, sample.clientName]))} />
      <h3>Sequence</h3>
      <SequenceTable label="Sequence preview" rows={plan.injections} detail={row => { const sample = row.aliquot_id ? byId.get(row.aliquot_id) : null; return sample ? `${sample.fullName} · ${sample.clientName}` : "—"; }} />
      <ActionForm action={saveBatchAction} submit="Save planned batch" pendingLabel="Saving…" className="form-actions">
        <Carried values={parsed.value} />
        <input type="hidden" name="plan" value={planKey(plan.injections)} />
      </ActionForm>
      <p className="muted"><small>Saving records version 1 as a planned batch and moves the orders to In batch. The sequence is frozen later, when you mark it exported.</small></p>
    </section>}
  </>;
}
