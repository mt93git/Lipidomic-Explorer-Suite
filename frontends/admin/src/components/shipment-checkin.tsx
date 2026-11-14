"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { StatTiles } from "@/components/stat-tiles";
import { checkInTubeAction, confirmReceiptAction, type CheckInState, type ConfirmState } from "@/app/(workspace)/receive-shipment/actions";
import {
  discrepancySummary, headerLine, noteRequired, STORAGE_TEMPERATURE, storageLabel, tally, tubeConditionNotes, tubeConditions, type CheckinView, type TubeCondition,
} from "@/lib/shipment-checkin";
import { formatLabInstant } from "@/lib/lab-time";
import { plural } from "@/lib/samples";
import styles from "./shipment-checkin.module.css";

const pillClass: Record<TubeCondition, string> = { intact: styles.intact, hemolyzed: styles.hemolyzed, thawed: styles.thawed, other: styles.other };

// Receive shipment, tube by tube (prototype a06): the header with the shipment, four tiles, the check-in panel with
// its manifest table, and the discrepancy note. A scan (or typed label) checks one tube in; Confirm receipt closes the
// shipment and needs the note when a tube is missing or damaged.
export function ShipmentCheckin({ view, confirmed = false }: { view: CheckinView; confirmed?: boolean }) {
  const [tubeState, checkIn, checking] = useActionState<CheckInState, FormData>(checkInTubeAction, {});
  const [confirmState, confirm, confirming] = useActionState<ConfirmState, FormData>(confirmReceiptAction, {});
  const [note, setNote] = useState(confirmState.note ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);
  const t = tally(view.tubes);
  const receipt = view.shipment.receipt;
  const closed = Boolean(receipt);
  const needsNote = noteRequired(t);
  const ids = { orderCode: view.orderCode, shipmentId: view.shipment.id };
  const temperature = receipt?.storageTemperature ?? STORAGE_TEMPERATURE;
  const labels = `/receive-shipment/labels?order=${encodeURIComponent(view.orderCode)}&shipment=${encodeURIComponent(view.shipment.id)}`;

  useEffect(() => { if (confirmState.error) setNoteError(confirmState.error); }, [confirmState]);

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / <Link href="/receive-shipment">Receive shipment</Link> / {view.orderCode}</div>
        <h1>Receive shipment · {view.orderCode}</h1>
        <p>{headerLine(view)}</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href={labels}>Print labels</Link>
        {closed
          ? <span className={`pill ok ${styles.confirmedPill}`}>Receipt confirmed</span>
          : <button className="button" form="confirm-receipt" disabled={confirming || !view.tubes.length}>{confirming ? "Confirming…" : "Confirm receipt"}</button>}
      </div>
    </div>

    {confirmed && receipt && <p className="notice success" role="status"><strong>Receipt confirmed.</strong> {plural(t.checkedIn, "tube")} checked in{receipt.missing ? `, ${receipt.missing} missing` : ""}{receipt.damaged ? `, ${receipt.damaged} damaged` : ""}. {receipt.note ? "The note is in the order's history and the client sees it on their order." : "The order's history records it."} <Link href={`/orders/${view.orderCode}`}>Open the order</Link></p>}
    {!view.tubes.length && <p className="notice warning" role="status">
      <strong>No manifest yet.</strong> {view.orderCode} has no registered samples on this shipment. Paste its Metadata sheet in the <Link href={`/sample-registry?order=${view.orderCode}`}>sample registry</Link>; each sample becomes a tube to check in here.
    </p>}

    <StatTiles label="Shipment summary" tiles={[
      { value: t.expected, label: "tubes expected" },
      { value: t.checkedIn, label: "checked in", tone: t.missing ? "warn" : t.expected ? "good" : undefined },
      { value: t.hemolyzed, label: "hemolyzed", tone: t.hemolyzed ? "warn" : undefined },
      { value: temperature, label: storageLabel(t) },
    ]} />

    <div className={styles.layout}>
      <section className={styles.card} aria-labelledby="checkin-title">
        <h2 className={styles.cardHead} id="checkin-title">Check-in</h2>
        <div className={styles.cardBody}>
          {closed
            ? <p className="muted">Receipt confirmed {formatLabInstant(receipt!.confirmedAt)}. The tubes of this shipment can no longer change.</p>
            : <form action={checkIn} className={styles.scan} aria-describedby={tubeState.error ? "scan-error" : tubeState.done ? "scan-done" : undefined}>
              <input type="hidden" name="orderCode" value={ids.orderCode} />
              <input type="hidden" name="shipmentId" value={ids.shipmentId} />
              <ScanFields key={tubeState.seq ?? 0} state={tubeState} disabled={!view.tubes.length} pending={checking} />
            </form>}
          {tubeState.error && <p className={`${styles.message} ${styles.bad}`} id="scan-error" role="alert">{tubeState.error}</p>}
          {!tubeState.error && tubeState.done && <p className={`${styles.message} ${styles.good}`} id="scan-done" role="status">{tubeState.done} checked in.</p>}
          <div className={styles.tableScroll} role="region" aria-label="Tubes on the manifest (scrolls)" tabIndex={0}>
            <table className={styles.table} aria-label="Tubes on the manifest">
              <thead><tr><th scope="col">Tube</th><th scope="col">Client ID</th><th scope="col">Condition</th><th scope="col">Box · Position</th><th scope="col"><span className="sr-only">Checked in</span></th></tr></thead>
              <tbody>{view.tubes.map(tube => {
                const c = tube.checkIn;
                return <tr key={tube.sampleCode} className={tube.sampleCode === tubeState.done ? styles.current : undefined}>
                  <td className="mono">{tube.sampleCode}</td>
                  <td>{tube.clientSampleId ?? "—"}</td>
                  <td>{c ? <span className={`${styles.pill} ${pillClass[c.condition]}`} title={c.note ?? undefined}>{c.condition}</span> : "—"}</td>
                  <td className="mono">{c?.box ? `${c.box} · ${c.position}` : "—"}</td>
                  <td>{c ? <span className={styles.tick} aria-label="checked in">✓</span> : <span className={`${styles.pill} ${styles.missing}`}>missing</span>}</td>
                </tr>;
              })}
              {!view.tubes.length && <tr><td colSpan={5} className="muted">Nothing on the manifest.</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="note-title">
        <h2 className={styles.cardHead} id="note-title">Discrepancy note</h2>
        <div className={styles.cardBody}>
          {closed
            ? <>
              <p className={styles.explain}>{receipt!.missing || receipt!.damaged ? `${plural(receipt!.missing, "tube")} missing, ${receipt!.damaged} damaged. The client sees this note on their order.` : "Every tube arrived intact."}</p>
              <p className={styles.savedNote}>{receipt!.note ?? "No note."}</p>
            </>
            : <form id="confirm-receipt" action={confirm} noValidate onSubmit={event => {
              if (needsNote && !note.trim()) {
                event.preventDefault();
                setNoteError(`${plural(t.missing, "tube")} missing and ${t.damaged} damaged: write a discrepancy note before confirming; the client reads it on their order.`);
                noteBox.current?.focus();
              }
            }}>
              <input type="hidden" name="orderCode" value={ids.orderCode} />
              <input type="hidden" name="shipmentId" value={ids.shipmentId} />
              <p className={styles.explain} id="receipt-explain">{discrepancySummary(t)}</p>
              <textarea id="receipt-note" ref={noteBox} name="note" rows={4} maxLength={2000} value={note} onChange={event => { setNote(event.target.value); setNoteError(null); }}
                placeholder={needsNote ? "What is missing or damaged, and what was done about it." : "Optional"} aria-invalid={noteError ? true : undefined}
                aria-labelledby="note-title" aria-describedby={noteError ? "receipt-explain receipt-note-error" : "receipt-explain"} required={needsNote} />
              {noteError && <p className={`${styles.message} ${styles.bad}`} id="receipt-note-error" role="alert">{noteError}</p>}
            </form>}
        </div>
      </section>
    </div>
  </>;
}

// The scan line and the tube's condition and place. Remounted (key) after each check-in, so the label clears and takes
// the focus again for the next scan while the box stays and the next position is filled in.
function ScanFields({ state, disabled, pending }: { state: CheckInState; disabled: boolean; pending: boolean }) {
  const [condition, setCondition] = useState(state.values?.condition ?? "intact");
  return <>
    <label className={styles.scanLabel} htmlFor="tube-label">Scan or type the tube label</label>
    <div className={styles.scanRow}>
      <input id="tube-label" name="label" className={styles.scanInput} autoFocus autoComplete="off" spellCheck={false} required disabled={disabled}
        placeholder="ORD044-S037 or the client's tube ID" />
      <button className="button secondary" disabled={disabled || pending}>{pending ? "Checking…" : "Check in"}</button>
    </div>
    <div className={styles.options}>
      <fieldset className={styles.conditions}>
        <legend className="sr-only">Condition</legend>
        {tubeConditions.map(item => <label key={item} className={styles.condition} title={tubeConditionNotes[item]}>
          <input type="radio" name="condition" value={item} checked={condition === item} onChange={() => setCondition(item)} />
          <span>{item}</span>
        </label>)}
      </fieldset>
      <label className={styles.slot}><span>Box</span><input name="box" defaultValue={state.values?.box ?? ""} placeholder="B12" autoComplete="off" /></label>
      <label className={styles.slot}><span>Position</span><input name="position" defaultValue={state.values?.position ?? ""} placeholder="C4" autoComplete="off" /></label>
      {condition === "other" && <label className={`${styles.slot} ${styles.otherNote}`}><span>Describe</span><input name="note" required placeholder="Cap cracked, label unreadable…" autoComplete="off" /></label>}
    </div>
  </>;
}
