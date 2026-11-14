import type { Metadata } from "next";
import Link from "@/components/app-link";
import { Digest } from "@/components/digest";
import { notFound } from "next/navigation";
import { DataError, getDataset, readDatasetWorkbook, type DatasetFile, type DatasetRecord, type ReleaseView } from "@/lib/data/release";
import { withBasePath } from "@/lib/base-path";
import { formatLabInstant } from "@/lib/lab-time";
import {
  datasetStatusLabels, formatBytes, isEligibleSigner, labRoleLabels, mayOpenInNexo, nexoDatasetLink, pendingSigners, personTurn, releaseButtonLabel, releaseDestination,
  releaseProgress, signerRoleLabels, signerRoles, signersRule, type LabPerson,
} from "@/lib/release";
import { PREVIEW_SHEETS, previewSheet, previewSheetName, type SheetPreview } from "@/lib/workbook-preview";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../action-form";
import { releaseDatasetAction, signDatasetAction, supersedeDatasetAction, withdrawDatasetAction } from "../actions";
import styles from "../release.module.css";

export const metadata: Metadata = { title: "Release dataset" };
type Params = { id: string };
type Query = { built?: string; signed?: string; released?: string; withdrawn?: string; superseded?: string; sheet?: string };

// The outcome of the last action, as a success banner with the next step; the dataset is what the page shows.
function Banner({ query, view, met, missing }: { query: Query; view: ReleaseView; met: boolean; missing: number }) {
  const { dataset } = view;
  const next = (href: string, label: string) => <Link className="button" href={href}>{label}</Link>;
  if (query.built) return <p className="notice success" role="status"><strong>Dataset v{dataset.version} built for {dataset.orderCode}.</strong> Three files recorded with their digests. It can now be signed.{next("#signatures-title", "Signatures →")}</p>;
  if (query.signed) return <p className="notice success" role="status"><strong>Signature recorded on dataset v{dataset.version}.</strong> {met ? "The policy count is met; it can be released." : `${missing} more signature${missing === 1 ? "" : "s"} by a different eligible person before release.`}{met && next("#release-actions", "Release it →")}</p>;
  if (query.released) return <p className="notice success" role="status"><strong>Dataset v{dataset.version} released.</strong> {dataset.orderCode} is now Released; the client can open it in Nexo.{next(`/datasets?order=${dataset.orderCode}`, "Datasets →")}</p>;
  if (query.withdrawn) return <p className="notice error" role="status"><strong>Dataset v{dataset.version} withdrawn.</strong></p>;
  if (query.superseded) return <p className="notice" role="status">Dataset v{dataset.version} is now superseded.</p>;
  return null;
}

// Demo mode only: whom a form acts as. Live mode has no such choice; the signed-in person acts.
function ActorField({ label, actors, defaultActor }: { label: string; actors: LabPerson[] | null; defaultActor: string }) {
  if (!actors) return null;
  return <label className={styles.actor}>{label}<small> · example workspace: choose which demo person acts</small>
    <select name="actor" defaultValue={defaultActor}>{actors.map(person => <option key={person.userId} value={person.userId}>{person.name} · {labRoleLabels[person.role]}</option>)}</select>
  </label>;
}

// The QC review's decisions in force when this version was built. Recorded only: every sample's data is in the files.
function ExclusionList({ exclusions }: { exclusions: DatasetRecord["exclusions"] }) {
  if (!exclusions.length) return <p className="muted">None recorded when this version was built.</p>;
  return <>
    <p className="muted">Decisions recorded in QC review. They are not applied to the files: every sample&apos;s data is in this version.</p>
    <ul className={styles.signatures} aria-labelledby="exclusions-title">{exclusions.map(item => <li key={item.sampleCode}>
      <span className="check-status fail" aria-hidden="true">✕</span>
      <span><strong className="mono">{item.sampleCode}</strong> · {item.reason}<small>{item.decidedBy ?? "Lab staff"} · {formatLabInstant(item.decidedAt)}</small></span>
    </li>)}</ul>
  </>;
}

function FileRow({ file }: { file: DatasetFile }) {
  return <tr><td>{file.label}</td><td className={styles.sheets}>{file.sheets.join(", ")}</td><td><Digest sha={file.sha256} label={file.label} /></td><td>{file.sizeBytes ? formatBytes(file.sizeBytes) : "—"}</td></tr>;
}

type Preview = { sheet: SheetPreview } | { problem: string };

// The Excel preview: the stored workbook's sheets as tabs (?sheet=), the first rows and columns of the selected one.
function ExcelPreview({ id, selected, preview, sha256 }: { id: string; selected: string; preview: Preview | null; sha256: string }) {
  return <section className={styles.card} aria-labelledby="preview-title">
    <div className={styles.cardHead}>
      <h2 id="preview-title">Excel preview</h2>
      <nav className={styles.tabs} aria-label="Workbook sheets">{PREVIEW_SHEETS.map(sheet =>
        <Link key={sheet.name} href={`/release/${id}?sheet=${sheet.name}`} scroll={false} aria-current={sheet.name === selected ? "page" : undefined}>{sheet.label}</Link>)}
      </nav>
    </div>
    <div className={styles.cardBody}>
      {!preview || "problem" in preview ? <p className="notice error" role="status">{preview && "problem" in preview ? preview.problem : "The stored workbook could not be read."}</p> : <>
        <div className={styles.scroll}><table className={styles.preview} aria-label={`${selected} sheet, first rows`}>
          <thead><tr>{preview.sheet.header.map((name, index) => <th key={index} scope="col">{name}</th>)}</tr></thead>
          <tbody>{preview.sheet.rows.map((row, r) => <tr key={r}>{row.map((cell, c) =>
            <td key={c} data-kind={cell.kind} title={cell.kind === "empty" ? "Empty cell" : undefined}>{cell.text}</td>)}</tr>)}</tbody>
        </table></div>
        <p className={styles.previewNote}>
          {preview.sheet.rows.length} of {preview.sheet.totalRows} rows · {preview.sheet.header.length} of {preview.sheet.totalColumns} columns · read only, from the stored workbook (SHA-256 <span className="mono">{sha256.slice(0, 12)}…</span>). Values as stored; an empty cell reads NA.
        </p>
      </>}
    </div>
  </section>;
}

export default async function ReleaseDatasetPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Query> }) {
  const session = await requireWorkspace("staff");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const view = await getDataset(id);
  if (!view) notFound();
  const { dataset, policy, people, me, versions, demoActors } = view;
  const progress = releaseProgress(policy, dataset.signatures, people);
  const eligible = (person: LabPerson | null | undefined) => isEligibleSigner(policy, person);
  // Demo: whom the Release button acts as, the last eligible demo person who signed (the countersigner).
  const lastSigner = [...dataset.signatures].reverse().map(item => demoActors?.find(person => person.userId === item.userId)).find(eligible);
  const demoReleaser = lastSigner ?? demoActors?.find(eligible) ?? demoActors?.[0];
  // Whose turn: the signed-in person; in the demo, the demo releaser once the count is met, else any pending demo signer.
  const pending = dataset.status === "built" && !progress.met ? pendingSigners(policy, dataset.signatures, people) : [];
  const demoPending = demoActors ? pendingSigners(policy, dataset.signatures, demoActors) : [];
  const turn = personTurn({ status: dataset.status, policy, signatures: dataset.signatures, people, person: demoActors ? (progress.met ? demoReleaser : demoPending[0] ?? demoReleaser) : me });
  const canSignAs = (person: LabPerson) => demoActors ? demoPending.some(item => item.userId === person.userId) : turn.action === "sign" && person.userId === me?.userId;
  const canRetire = dataset.status === "released" && (demoActors ? true : eligible(me));
  const newer = versions.filter(version => version.status === "released" && version.version > dataset.version);
  const eligibleNames = policy.eligibleSigners.length
    ? policy.eligibleSigners.map(userId => people.find(person => person.userId === userId)?.name ?? `${userId.slice(0, 8)}…`).join(", ")
    : "any lab Owner or Admin";
  const nexo = nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, dataset, mayOpenInNexo(session.view));
  const sheet = previewSheetName(query.sheet);
  let preview: Preview | null = null;
  try {
    const stored = await readDatasetWorkbook(dataset);
    preview = { sheet: await previewSheet(stored.bytes, sheet) };
  } catch (error) {
    if (!(error instanceof DataError) && !(error instanceof Error && /^The stored workbook has no /.test(error.message))) throw error;
    preview = { problem: error.message };
  }
  const readable = !!preview && "sheet" in preview;
  const facts: [string, string][] = [
    ["Client", dataset.clientName], ["Order", `${dataset.orderCode}${dataset.orderTitle ? ` · ${dataset.orderTitle}` : ""}`], ["Version", `v${dataset.version} of ${versions.length}`],
    ["Built", `${formatLabInstant(dataset.builtAt)}${dataset.builtBy ? ` · ${dataset.builtBy}` : ""}`],
    ["Source TXT", dataset.provenance.sourceSha256 ?? "not recorded"], ["SCIEX OS", dataset.provenance.sciexOsVersion ?? "not provided"], ["Processing method", dataset.provenance.processingMethod ?? "not provided"],
    ...(dataset.provenance.acceptedAt ? [["Results accepted", formatLabInstant(dataset.provenance.acceptedAt)] as [string, string]] : []),
    ...(dataset.provenance.headers ? [["Abundance headers", dataset.provenance.headers] as [string, string]] : []),
    ["Value type", "raw peak area"],
  ];
  const personOf = (userId: string) => people.find(person => person.userId === userId) ?? demoActors?.find(person => person.userId === userId);
  return <>
    <div className="page-heading">
      <div>
        <h1>Release · {dataset.orderCode} · dataset v{dataset.version}</h1>
        <p><span>{releaseDestination(dataset)}</span>{dataset.status !== "built" && <> · <span className={styles.state} data-status={dataset.status}>{datasetStatusLabels[dataset.status]}</span></>}</p>
      </div>
      <div className="heading-actions" id="release-actions">
        {readable ? <a className="button secondary" href={withBasePath(`/release/${dataset.id}/workbook`)} download>Download Excel</a>
          : <span className="button secondary" aria-disabled="true">Download Excel</span>}
        {dataset.status === "built" && <ActionForm action={releaseDatasetAction} submit={releaseButtonLabel(progress, turn.action)} pendingLabel="Releasing…" disabled={turn.action !== "release"} className={styles.headerForm}>
          <input type="hidden" name="datasetId" value={dataset.id} />
          {demoActors && <input type="hidden" name="actor" value={demoReleaser?.userId ?? ""} />}
        </ActionForm>}
        {dataset.status === "released" && nexo && <a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a>}
      </div>
    </div>
    <Banner query={query} view={view} met={progress.met} missing={progress.missing} />
    {dataset.status === "withdrawn" && !query.withdrawn && <p className="notice error" role="status"><strong>Withdrawn{dataset.archivedAt ? ` ${formatLabInstant(dataset.archivedAt)}` : ""}.</strong>{dataset.archivedReason ? ` ${dataset.archivedReason}` : ""}</p>}
    {dataset.status === "superseded" && <p className="notice">{dataset.archivedReason ?? "Superseded"}{dataset.archivedAt ? ` · ${formatLabInstant(dataset.archivedAt)}` : ""}.</p>}

    <div className={styles.releaseGrid}>
      <ExcelPreview id={dataset.id} selected={sheet} preview={preview} sha256={dataset.full.sha256} />

      <div className={styles.side}>
        <section className={styles.card} aria-labelledby="signatures-title">
          <div className={styles.cardHead}><h2 id="signatures-title">Signatures</h2><span className={styles.count}>{progress.counted} of {progress.required}</span></div>
          <div className={styles.cardBody}>
            <ul className={styles.signers} aria-label="Signatures">
              {dataset.signatures.map(item => {
                const person = personOf(item.userId);
                return <li key={item.id} aria-label={`${item.name}, signed`}>
                  <span className={styles.mark} data-state="signed" aria-hidden="true">✓</span>
                  <span><strong>{item.name}</strong>{person ? ` · ${labRoleLabels[person.role]}` : ""}
                    <small>signed {formatLabInstant(item.signedAt)} · {signerRoleLabels[item.role]}{item.note ? ` · "${item.note}"` : ""}{eligible(people.find(p => p.userId === item.userId)) ? "" : " · no longer eligible; kept as evidence"}</small></span>
                </li>;
              })}
              {pending.map(person => <li key={person.userId} aria-label={`${person.name}, ${progress.counted ? "countersign" : "signature"} required`}>
                <span className={styles.mark} data-state="pending" aria-hidden="true">○</span>
                <span><strong>{person.name}</strong> · {labRoleLabels[person.role]}<small>{progress.counted ? "countersign required" : "signature required"}</small></span>
                {canSignAs(person) && <ActionForm action={signDatasetAction} submit="Sign" pendingLabel="Signing…" secondary className={styles.signForm}>
                  <input type="hidden" name="datasetId" value={dataset.id} />
                  {demoActors && <input type="hidden" name="actor" value={person.userId} />}
                  <details className={styles.signDetails}><summary>Role and note</summary>
                    <label>Role<select name="role" defaultValue="reviewed">{signerRoles.map(role => <option key={role} value={role}>{signerRoleLabels[role]}</option>)}</select></label>
                    <label>Note (optional)<input name="note" maxLength={2000} placeholder="What you checked" /></label>
                  </details>
                </ActionForm>}
              </li>)}
            </ul>
            {!dataset.signatures.length && !pending.length && <p className="muted">No signature yet.</p>}
            {(!demoActors || dataset.status !== "built") && <p className={styles.turnNote}>{turn.reason}{turn.action === "release" && " Releasing freezes this version and lets the client's people open it in Nexo."}</p>}
            <p className={styles.rule}>{signersRule(policy.requiredSignatures, dataset.version)}</p>
            <p className={styles.eligible}>Eligible under the current policy: {eligibleNames}.{demoActors ? " Example workspace: each Sign button acts as that demo person." : ""}</p>
          </div>
        </section>

        {dataset.status === "released" && <section className="panel" aria-labelledby="withdraw-title">
          <div className="eyebrow">If this version must be pulled</div>
          <h2 id="withdraw-title">Withdraw</h2>
          <p className="muted">Withdrawing freezes this version as withdrawn, with your reason, for everyone who can see it.</p>
          <ActionForm action={withdrawDatasetAction} submit="Withdraw" pendingLabel="Withdrawing…" disabled={!canRetire} secondary className={styles.form}>
            <input type="hidden" name="datasetId" value={dataset.id} />
            <ActorField label="Withdraw as" actors={demoActors} defaultActor={demoReleaser?.userId ?? ""} />
            <label>Reason<textarea name="reason" maxLength={2000} required placeholder="Why this version is withdrawn" /></label>
          </ActionForm>
          {newer.length > 0 && <ActionForm action={supersedeDatasetAction} submit="Mark as superseded" pendingLabel="Saving…" disabled={!canRetire} secondary className={styles.form}>
            <input type="hidden" name="datasetId" value={dataset.id} />
            <ActorField label="Supersede as" actors={demoActors} defaultActor={demoReleaser?.userId ?? ""} />
            <label>Superseded by<select name="newDatasetId" defaultValue={newer[newer.length - 1].id}>{newer.map(version => <option key={version.id} value={version.id}>v{version.version} · released</option>)}</select></label>
          </ActionForm>}
        </section>}
      </div>
    </div>

    <div className={`detail-grid ${styles.below}`}>
      <section className="panel" aria-labelledby="manifest-title">
        <div className="eyebrow">Manifest</div>
        <h2 id="manifest-title">Files of this version</h2>
        <p className="muted">The analysis file is what Nexo opens; the companion stays in Admin. Signatures freeze all three digests; the release publishes exactly the recorded analysis file.</p>
        <div className={styles.scroll}><table className={styles.files} aria-label="Files of this version">
          <thead><tr><th scope="col">File</th><th scope="col">Sheets</th><th scope="col">SHA-256</th><th scope="col">Size</th></tr></thead>
          <tbody><FileRow file={dataset.full} /><FileRow file={dataset.analysis} /><FileRow file={dataset.companion} /></tbody>
        </table></div>
        <dl className="facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{label === "Source TXT" && dataset.provenance.sourceSha256 ? <Digest sha={value} label="Source TXT" /> : value}</dd></div>)}</dl>
        <h3 className={styles.subhead} id="exclusions-title">Sample exclusions</h3>
        <ExclusionList exclusions={dataset.exclusions} />
      </section>

      <section className="panel" aria-labelledby="versions-title">
        <div className="eyebrow">This order</div>
        <h2 id="versions-title">Versions</h2>
        <ul className="order-list compact" aria-label="Versions of this order">
          {versions.map(version => <li key={version.id}>{version.id === dataset.id
            ? <span className="order-choice" aria-current="true"><span className="order-code">v{version.version}</span>{datasetStatusLabels[version.status]} · this page</span>
            : <Link className="order-choice" href={`/release/${version.id}`}><span className="order-code">v{version.version}</span>{datasetStatusLabels[version.status]}<small>{version.signatures} signature{version.signatures === 1 ? "" : "s"}{version.releasedAt ? ` · released ${formatLabInstant(version.releasedAt)}` : ""}</small></Link>}
          </li>)}
        </ul>
        <div className={styles.links}>
          <Link className="button secondary" href={`/orders/${dataset.orderCode}`}>Order detail</Link>
          <Link className="button secondary" href="/release">← All releases</Link>
        </div>
      </section>
    </div>
  </>;
}
