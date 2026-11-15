import type { Metadata } from "next";
import { mayEditNotificationRules, mayReadNotificationLog, myNotificationSwitches, notificationMatrix, recentNotificationLog, LOG_ROWS } from "@/lib/data/notifications";
import { formatLabInstant } from "@/lib/lab-time";
import { eventLabel, isNotificationKind, kindInfo, logKindLabels, notifyConfig, type NotificationRule } from "@/lib/notifications";
import { requireWorkspace } from "@/lib/session";
import styles from "./notifications.module.css";
import { MatrixRow } from "./matrix-row";
import { SwitchForm } from "./switch-form";

export const metadata: Metadata = { title: "Notifications" };
const statusPill = { sent: "ok", failed: "fail", skipped: "pending" } as const;
const statusLabel = { sent: "Sent", failed: "Failed", skipped: "Skipped" } as const;

// Lab staff: the event x audience matrix (0036), which a lab Owner or Admin edits; then their own switches and, for
// Owner and Admin, the last sends. A client's people: their own switches. The example workspace lets its lab view edit
// the matrix in this browser and shows it the demo log, where every row is skipped.
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; rule?: string }> }) {
  const session = await requireWorkspace("all");
  const { saved, rule } = await searchParams;
  const staff = session.view === "staff";
  const showLog = mayReadNotificationLog(session);
  const editable = mayEditNotificationRules(session);
  const [switches, log, matrix] = await Promise.all([
    myNotificationSwitches(session), showLog ? recentNotificationLog() : Promise.resolve([]), staff ? notificationMatrix() : Promise.resolve([] as NotificationRule[]),
  ]);
  const savedKind = saved?.replace(/-(on|off)$/, "");
  const savedOn = saved?.endsWith("-on");
  const savedRule = rule && isNotificationKind(rule) ? matrix.find(row => row.kind === rule) : undefined;
  const config = notifyConfig();
  return <>
    <div className="page-heading">
      <div>
        {!staff && <div className="eyebrow">Client portal / Notifications</div>}
        <h1>Notifications</h1>
        {staff
          ? <p>Who hears about what, by email.</p>
          : <p>The emails the lab sends you, from {"“"}Lipidomics · Libreros Lab{"”"}. Each one is on until you turn it off.
            {session.clients.length > 1 && ` Your choice applies to every client you belong to${session.selectedClient ? `, not only ${session.selectedClient.name}` : ""}.`}</p>}
      </div>
    </div>
    {savedRule && <p className="notice success" role="status"><strong>{eventLabel(savedRule.kind, savedRule.days)}: saved.</strong> The next email for this event goes to these audiences.</p>}
    {savedKind && isNotificationKind(savedKind) && <p className="notice success" role="status"><strong>{kindInfo[savedKind].label}: {savedOn ? "on" : "off"}.</strong> {savedOn ? "You get these emails again." : "You no longer get these emails."}</p>}
    {staff && <>
      <div className={styles.matrixBox} role="region" aria-label="Who hears about what" tabIndex={0}>
        <table className={styles.matrix} aria-label="Who hears about what, by email">
          <thead><tr><th scope="col">Event</th><th scope="col">Lab staff</th><th scope="col">Client admin</th><th scope="col">Requester</th><th scope="col">Client members</th></tr></thead>
          <tbody>{matrix.map(row => <MatrixRow key={row.kind} row={row} editable={editable} />)}</tbody>
        </table>
      </div>
      <p className={styles.footnote}>Emails go out only for these events; nothing is sent without one.</p>
      <p className={`muted ${styles.legend}`}>{editable ? "Click a mark or a name to change who gets the email. " : "A lab Owner or Admin changes who gets each email. "}
        Lab staff are chosen by role; the owner of the step is who recorded it. Requester: the client member who asked for the order.
        Client members: everyone in the order's client, viewers too. Order requested, Gate failed, the results check and Access requested are for lab staff only.
        The results check runs every hour on the server and when lab staff open the Pipeline, and emails once per order.
        {" "}Each person can still turn an email off for themselves below.</p>
      <hr className={styles.rule} />
    </>}
    <section className="panel" aria-labelledby="mine-title">
      <div className="eyebrow">Your emails</div>
      <h2 id="mine-title">{staff ? "Lab work" : "Your orders and datasets"}</h2>
      <div className={styles.switches}>
        {switches.map(item => <SwitchForm key={item.kind} kind={item.kind} label={item.label} description={item.description} enabled={item.enabled} />)}
      </div>
    </section>
    {showLog && <section className={`panel ${styles.section}`} aria-labelledby="log-title">
      <div className="eyebrow">Lab Owner and Admin</div>
      <h2 id="log-title">Recent sends</h2>
      <p className="muted">The last {LOG_ROWS} emails, one row per recipient. {session.mock
        ? "The example workspace sends nothing, so every row is skipped."
        : config.send ? `This server sends emails${config.allow ? `, only to ${config.allow.join(", ")} addresses` : ""}.` : "Sending is off on this server, so new rows are skipped."}</p>
      {log.length
        ? <div className={styles.scroll} role="region" aria-label="Sent emails table" tabIndex={0}><table className={styles.table} aria-label="Recent sends">
          <thead><tr><th scope="col">When</th><th scope="col">Kind</th><th scope="col">Recipient</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
          <tbody>{log.map(row => <tr key={row.id}>
            <td><time dateTime={row.at}>{formatLabInstant(row.at)}</time></td>
            <td>{logKindLabels[row.kind] ?? row.kind}{row.reference && <small>{row.reference}</small>}</td>
            <td>{row.email}</td>
            <td><span className={`pill ${statusPill[row.status]}`}>{statusLabel[row.status]}</span></td>
            <td className={row.error ? undefined : styles.none}>{row.error ?? <span className="muted">None</span>}</td>
          </tr>)}</tbody>
        </table></div>
        : <p className="empty-state">No emails yet.</p>}
    </section>}
  </>;
}
