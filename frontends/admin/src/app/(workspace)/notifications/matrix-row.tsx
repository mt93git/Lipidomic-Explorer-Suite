"use client";

import { useActionState, type ReactNode } from "react";
import { FormAlert } from "@/components/error-summary";
import { eventLabel, labCell, ruleAllows, ruleLabRoleNames, ruleLabRoles, type NotificationRule } from "@/lib/notifications";
import { setRuleAction, type RuleState } from "./actions";
import styles from "./notifications.module.css";

type Change = Partial<Omit<NotificationRule, "kind">>;

// The whole row as hidden fields, with one change: each cell's form saves the row it shows (admin.set_notification_rule
// takes a whole row). The lab staff and delay editors send their own fields instead of the hidden ones.
function RowFields({ row, change = {}, skip = [] }: { row: NotificationRule; change?: Change; skip?: ("labRoles" | "stepOwner" | "days")[] }) {
  const next = { ...row, ...change };
  return <>
    <input type="hidden" name="kind" value={row.kind} />
    {!skip.includes("labRoles") && next.labRoles.map(role => <input key={role} type="hidden" name="labRoles" value={role} />)}
    {!skip.includes("stepOwner") && <input type="hidden" name="stepOwner" value={String(next.stepOwner)} />}
    <input type="hidden" name="clientAdmin" value={String(next.clientAdmin)} />
    <input type="hidden" name="requester" value={String(next.requester)} />
    {!skip.includes("days") && next.days !== null && <input type="hidden" name="days" value={String(next.days)} />}
  </>;
}

function RuleForm({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const [state, action, pending] = useActionState<RuleState, FormData>(setRuleAction, {});
  return <form action={action} className={className} aria-label={label} aria-busy={pending}>
    {children}
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}

const Mark = ({ on }: { on: boolean }) => <><span aria-hidden="true">{on ? "✓" : "—"}</span><span className="sr-only">{on ? "Gets this email" : "Does not get this email"}</span></>;

// One event of the matrix. An Owner or Admin edits it in place: the check marks and dashes are buttons that flip the
// cell; the lab staff cell and the results check's delay open a small editor.
export function MatrixRow({ row, editable }: { row: NotificationRule; editable: boolean }) {
  const allows = ruleAllows(row.kind);
  const event = eventLabel(row.kind, row.days);
  const lab = labCell(row);
  // A saved row remounts its editors, so they close once the change is in.
  const version = JSON.stringify(row);
  const toggle = (cell: "clientAdmin" | "requester", audience: string) => {
    const on = row[cell];
    if (!allows.client) return <td className={styles.na}><span aria-hidden="true">—</span><span className="sr-only">Not for this event</span></td>;
    if (!editable) return <td className={on ? styles.on : styles.off}><Mark on={on} /></td>;
    return <td className={on ? styles.on : styles.off}>
      <RuleForm label={`${audience}: ${event}`}>
        <RowFields row={row} change={{ [cell]: !on }} />
        <button className={styles.mark} aria-pressed={on} title={on ? `Stop emailing the ${audience.toLowerCase()}` : `Email the ${audience.toLowerCase()}`}
          data-testid={`${row.kind}-${cell}`}><Mark on={on} /><span className="sr-only">{`, ${audience}, ${event}. ${on ? "Turn off" : "Turn on"}`}</span></button>
      </RuleForm>
    </td>;
  };
  return <tr data-kind={row.kind}>
    <th scope="row">
      {allows.days && editable
        ? <>No results TXT <details key={version} className={styles.inline}>
            <summary className={styles.days} aria-label={`${row.days} days: change the delay`} data-testid="results_missing-days">{row.days}</summary>
            <RuleForm className={styles.editor} label="Days after acquisition">
              <RowFields row={row} skip={["days"]} />
              <label>Days after acquisition <input type="number" name="days" min={1} max={60} defaultValue={row.days ?? 3} required /></label>
              <button className="button">Save</button>
            </RuleForm>
          </details> {row.days === 1 ? "day" : "days"} after acquisition</>
        : event}
    </th>
    <td className={lab === "—" ? styles.off : undefined}>
      {editable
        ? <details key={version} className={styles.inline}>
            <summary className={styles.lab} data-testid={`${row.kind}-lab`}>{lab}<span className="sr-only">: change which lab staff get {event}</span></summary>
            <RuleForm className={styles.editor} label={`Lab staff: ${event}`}>
              <RowFields row={row} skip={["labRoles", "stepOwner"]} />
              <fieldset><legend>Lab staff</legend>
                {allows.stepOwner && <label><input type="checkbox" name="stepOwner" value="true" defaultChecked={row.stepOwner} /> Owner of the step</label>}
                {ruleLabRoles.map(role => <label key={role}><input type="checkbox" name="labRoles" value={role} defaultChecked={row.labRoles.includes(role)} /> {ruleLabRoleNames[role]}</label>)}
              </fieldset>
              <button className="button">Save</button>
            </RuleForm>
          </details>
        : lab}
    </td>
    {toggle("clientAdmin", "Client admin")}
    {toggle("requester", "Requester")}
  </tr>;
}
