import type { Metadata } from "next";
import Link from "@/components/app-link";
import { Digest } from "@/components/digest";
import { notFound } from "next/navigation";
import { getDataset, type DatasetFile, type DatasetRecord, type ReleaseView } from "@/lib/data/release";
import { formatLabInstant } from "@/lib/lab-time";
import {
  datasetStatusLabels, formatBytes, isEligibleSigner, labRoleLabels, mayOpenInNexo, nexoDatasetLink, personTurn, releaseProgress, signerRoleLabels, signerRoles, teamLink, type LabPerson,
  type ReleaseProgress,
} from "@/lib/release";
import { requireWorkspace } from "@/lib/session";
import { ActionForm } from "../action-form";
import { releaseDatasetAction, signDatasetAction, supersedeDatasetAction, withdrawDatasetAction } from "../actions";
import styles from "../release.module.css";

export const metadata: Metadata = { title: "Release dataset" };
type Params = { id: string };
type Query = { built?: string; signed?: string; released?: string; withdrawn?: string; superseded?: string };

// The outcome of the last action, as a success banner with the next step; the dataset is what the page shows.
function Banner({ query, view, met, missing }: { query: Query; view: ReleaseView; met: boolean; missing: number }) {
  const { dataset } = view;
  const next = (href: string, label: string) => <Link className="button" href={href}>{label}</Link>;
  if (query.built) return <p className="notice success" role="status"><strong>Dataset v{dataset.version} built for {dataset.orderCode}.</strong> Three files recorded with their digests. It can now be signed.{next("#turn-title", "Sign this version →")}</p>;
  if (query.signed) return <p className="notice success" role="status"><strong>Signature recorded on dataset v{dataset.version}.</strong> {met ? "The policy count is met; it can be released." : `${missing} more signature${missing === 1 ? "" : "s"} by a different eligible person before release.`}{met && next("#turn-title", "Release it →")}</p>;
  if (query.released) return <p className="notice success" role="status"><strong>Dataset v{dataset.version} released.</strong> {dataset.orderCode} is now Released and its Team project exists.{next(`/datasets?order=${dataset.orderCode}`, "Datasets →")}</p>;
  if (query.withdrawn) return <p className="notice error" role="status"><strong>Dataset v{dataset.version} withdrawn.</strong> The Team project it created stays in the library.</p>;
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

type Step = { name: string; detail: string; state: "done" | "current" | "todo" };

// Where the version is, under the title: Built → Signatures n of m → Release; once released, Released → Team project → Withdraw.
function StatusStrip({ dataset, progress }: { dataset: DatasetRecord; progress: ReleaseProgress }) {
  const signers = dataset.signatures.map(signature => signature.name);
  const steps: Step[] = dataset.status === "released" ? [
    { name: "Released", detail: dataset.releasedAt ? formatLabInstant(dataset.releasedAt) : "Released", state: "done" },
    { name: "Team project", detail: dataset.projectName ?? dataset.orderCode, state: "done" },
    { name: "Withdraw", detail: "Only if this version must be pulled", state: "todo" },
  ] : [
    { name: "Built", detail: `${formatLabInstant(dataset.builtAt)}${dataset.builtBy ? ` · ${dataset.builtBy}` : ""}`, state: "done" },
    { name: `Signatures ${progress.counted} of ${progress.required}`, state: progress.met ? "done" : "current",
      detail: `${signers.length ? `${signers.join(", ")} signed` : "No signature yet"}${progress.met ? "" : ` · ${progress.missing === 1 ? "one more person" : `${progress.missing} more people`}`}` },
    { name: "Release", detail: "Creates the Team project", state: progress.met ? "current" : "todo" },
  ];
  return <ol className={styles.steps} aria-label="Release progress">{steps.map((step, index) =>
    <li key={step.name} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
      <span className={styles.dot} aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</span>
      <span><strong>{step.name}</strong><small>{step.detail}</small></span>
    </li>)}</ol>;
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

export default async function ReleaseDatasetPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Query> }) {
  const session = await requireWorkspace("staff");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const view = await getDataset(id);
  if (!view) notFound();
  const { dataset, policy, people, me, versions, demoActors } = view;
  const progress = releaseProgress(policy, dataset.signatures, people);
  const eligible = (person: LabPerson | null | undefined) => isEligibleSigner(policy, person);
  const signedBy = new Set(dataset.signatures.map(signature => signature.userId));
  // Who the demo forms act as by default: the first eligible demo person who has not signed yet.
  const demoSigner = demoActors?.find(person => eligible(person) && !signedBy.has(person.userId)) ?? demoActors?.find(eligible) ?? demoActors?.[0];
  const demoReleaser = demoActors?.find(person => eligible(person) && signedBy.has(person.userId)) ?? demoActors?.find(eligible) ?? demoActors?.[0];
  // Whose turn: the signed-in person; in the demo, the person the forms act as by default.
  const turn = personTurn({ status: dataset.status, policy, signatures: dataset.signatures, people, person: demoActors ? demoSigner : me });
  const turnTitle = turn.action === "sign" ? "Sign this version" : turn.action === "release" ? "Release this version" : "Nothing to do now";
  const active = dataset.status === "built" || dataset.status === "released";
  const canRetire = dataset.status === "released" && (demoActors ? true : eligible(me));
  const newer = versions.filter(version => version.status === "released" && version.version > dataset.version);
  const eligibleNames = policy.eligibleSigners.length
    ? policy.eligibleSigners.map(userId => people.find(person => person.userId === userId)?.name ?? `${userId.slice(0, 8)}…`).join(", ")
    : "any lab Owner or Admin";
  const nexo = nexoDatasetLink(process.env.NEXT_PUBLIC_NEXO_URL, dataset, mayOpenInNexo(session.view));
  const team = teamLink(process.env.NEXT_PUBLIC_TEAM_URL);
  const facts: [string, string][] = [
    ["Client", dataset.clientName], ["Order", `${dataset.orderCode}${dataset.orderTitle ? ` · ${dataset.orderTitle}` : ""}`], ["Version", `v${dataset.version} of ${versions.length}`],
    ["Built", `${formatLabInstant(dataset.builtAt)}${dataset.builtBy ? ` · ${dataset.builtBy}` : ""}`],
    ["Source TXT", dataset.provenance.sourceSha256 ?? "not recorded"], ["SCIEX OS", dataset.provenance.sciexOsVersion ?? "not provided"], ["Processing method", dataset.provenance.processingMethod ?? "not provided"],
    ...(dataset.provenance.acceptedAt ? [["Results accepted", formatLabInstant(dataset.provenance.acceptedAt)] as [string, string]] : []),
    ...(dataset.provenance.headers ? [["Abundance headers", dataset.provenance.headers] as [string, string]] : []),
    ["Value type", "raw peak area"],
  ];
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / <Link href="/release">Release</Link> / {dataset.orderCode}</div>
        <h1>{dataset.orderCode} · Dataset v{dataset.version}</h1>
        <p>{dataset.orderTitle || dataset.clientName} · <span className={styles.state} data-status={dataset.status}>{datasetStatusLabels[dataset.status]}</span></p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href={`/orders/${dataset.orderCode}`}>Order detail</Link>
        <Link className="button secondary" href="/release">← All releases</Link>
      </div>
    </div>
    <Banner query={query} view={view} met={progress.met} missing={progress.missing} />
    {dataset.status === "withdrawn" && !query.withdrawn && <p className="notice error" role="status"><strong>Withdrawn{dataset.archivedAt ? ` ${formatLabInstant(dataset.archivedAt)}` : ""}.</strong>{dataset.archivedReason ? ` ${dataset.archivedReason}` : ""}</p>}
    {dataset.status === "superseded" && <p className="notice">{dataset.archivedReason ?? "Superseded"}{dataset.archivedAt ? ` · ${formatLabInstant(dataset.archivedAt)}` : ""}.</p>}

    {active && <StatusStrip dataset={dataset} progress={progress} />}

    <div className="detail-grid">
      <div>
        {active && <section className={styles.turn} aria-labelledby="turn-eyebrow turn-title">
          <div className="eyebrow" id="turn-eyebrow">Your turn</div>
          <h2 id="turn-title">{turnTitle}</h2>
          <p className="muted">{turn.reason}{turn.action === "release" && " Releasing stages the analysis file in Team's library, creates the project with the client's people as viewers and the signers as owners, and freezes this version."}</p>
          {turn.action === "sign" && <ActionForm action={signDatasetAction} submit="Sign" pendingLabel="Signing…" className={styles.form}>
            <input type="hidden" name="datasetId" value={dataset.id} />
            <ActorField label="Sign as" actors={demoActors} defaultActor={demoSigner?.userId ?? ""} />
            <label>Role<select name="role" defaultValue="reviewed">{signerRoles.map(role => <option key={role} value={role}>{signerRoleLabels[role]}</option>)}</select></label>
            <label>Note (optional)<input name="note" maxLength={2000} placeholder="What you checked" /></label>
          </ActionForm>}
          {turn.action === "release" && <ActionForm action={releaseDatasetAction} submit="Release dataset" pendingLabel="Releasing…" className={styles.form}>
            <input type="hidden" name="datasetId" value={dataset.id} />
            <ActorField label="Release as" actors={demoActors} defaultActor={demoReleaser?.userId ?? ""} />
          </ActionForm>}
        </section>}

        <section className="panel" aria-labelledby="manifest-title">
          <div className="eyebrow">Manifest</div>
          <h2 id="manifest-title">Files of this version</h2>
          <p className="muted">The analysis file is what Team and Nexo open; the companion stays in Admin. Signatures freeze all three digests; the release publishes exactly the recorded analysis file.</p>
          <div className={styles.scroll}><table className={styles.files} aria-label="Files of this version">
            <thead><tr><th scope="col">File</th><th scope="col">Sheets</th><th scope="col">SHA-256</th><th scope="col">Size</th></tr></thead>
            <tbody><FileRow file={dataset.full} /><FileRow file={dataset.analysis} /><FileRow file={dataset.companion} /></tbody>
          </table></div>
          <dl className="facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{label === "Source TXT" && dataset.provenance.sourceSha256 ? <Digest sha={value} label="Source TXT" /> : value}</dd></div>)}</dl>
          <h3 className={styles.subhead} id="exclusions-title">Sample exclusions</h3>
          <ExclusionList exclusions={dataset.exclusions} />
        </section>

        <section className="panel" aria-labelledby="signatures-title">
          <div className="panel-heading"><div><div className="eyebrow">Who signed</div><h2 id="signatures-title">Signatures</h2></div>
            <span className={`pill ${progress.met ? "ok" : "pending"}`}>{progress.counted} of {progress.required} required signatures</span></div>
          <p className="muted">Eligible under the current policy: {eligibleNames}. Each person signs once; the release needs {policy.requiredSignatures} different eligible people.</p>
          {dataset.signatures.length
            ? <ul className={styles.signatures} aria-label="Signatures">{dataset.signatures.map(signature => <li key={signature.id}>
              <span className="check-status ok" aria-hidden="true">✓</span>
              <span><strong>{signature.name}</strong> · {signerRoleLabels[signature.role]}{signature.note ? ` · ${signature.note}` : ""}<small>{formatLabInstant(signature.signedAt)}{eligible(people.find(person => person.userId === signature.userId)) ? "" : " · no longer eligible; kept as evidence"}</small></span>
            </li>)}</ul>
            : <p className="muted">No signature yet.</p>}
        </section>
      </div>

      <div>
        <section className="panel" aria-labelledby="release-title">
          <div className="eyebrow">{dataset.status === "built" ? "Then" : "Released"}</div>
          <h2 id="release-title">{dataset.status === "built" ? "Release" : "Team project"}</h2>
          {dataset.status === "built" && <>
            <p className="muted">{progress.met ? "The policy count is met. Releasing stages the analysis file in Team's library, creates the project with the client's people as viewers and the signers as owners, and freezes this version." : `${progress.missing} more signature${progress.missing === 1 ? "" : "s"} by a different eligible person before this version can be released.`}</p>
          </>}
          {dataset.projectId && <div className={styles.project}>
            <strong>{dataset.projectName ?? dataset.orderCode}</strong>
            <span>Project id <span className={`mono ${styles.id}`}>{dataset.projectId}</span></span>
            {dataset.releasedAt && <span className="muted">Released {formatLabInstant(dataset.releasedAt)}</span>}
            <span className="muted">The analysis file is in Team&apos;s library; the client&apos;s people see it as viewers, the signers as owners.</span>
            <div className={styles.links}>
              {team ? <a className="button secondary" href={team} target="_blank" rel="noreferrer">Open Team</a> : <span className="muted">Team link: set NEXT_PUBLIC_TEAM_URL</span>}
              {nexo ? <a className="button" href={nexo} target="_blank" rel="noreferrer">Open in Nexo</a>
                : dataset.status === "released" && !process.env.NEXT_PUBLIC_NEXO_URL?.trim() ? <span className="muted">Nexo link: set NEXT_PUBLIC_NEXO_URL</span> : null}
            </div>
            {nexo && <small className="muted">Nexo opens this released version from Admin&apos;s own record and checks its SHA-256.</small>}
          </div>}
        </section>

        {dataset.status === "released" && <section className="panel" aria-labelledby="withdraw-title">
          <div className="eyebrow">If this version must be pulled</div>
          <h2 id="withdraw-title">Withdraw</h2>
          <p className="muted">Withdrawing freezes this version as withdrawn, with your reason, for everyone who can see it. The Team project is not removed; Admin never changes Team&apos;s records.</p>
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

        <section className="panel" aria-labelledby="versions-title">
          <div className="eyebrow">This order</div>
          <h2 id="versions-title">Versions</h2>
          <ul className="order-list compact" aria-label="Versions of this order">
            {versions.map(version => <li key={version.id}>{version.id === dataset.id
              ? <span className="order-choice" aria-current="true"><span className="order-code">v{version.version}</span>{datasetStatusLabels[version.status]} · this page</span>
              : <Link className="order-choice" href={`/release/${version.id}`}><span className="order-code">v{version.version}</span>{datasetStatusLabels[version.status]}<small>{version.signatures} signature{version.signatures === 1 ? "" : "s"}{version.releasedAt ? ` · released ${formatLabInstant(version.releasedAt)}` : ""}</small></Link>}
            </li>)}
          </ul>
        </section>
      </div>
    </div>
  </>;
}
