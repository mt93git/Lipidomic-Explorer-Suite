import type { Metadata } from "next";
import { mayReadNotificationLog, myNotificationSwitches, recentNotificationLog, LOG_ROWS } from "@/lib/data/notifications";
import { formatLabInstant } from "@/lib/lab-time";
import { isNotificationKind, kindInfo, logKindLabels, notifyConfig } from "@/lib/notifications";
import { requireWorkspace } from "@/lib/session";
import styles from "./notifications.module.css";
import { SwitchForm } from "./switch-form";

export const metadata: Metadata = { title: "Notifications" };
const statusPill = { sent: "ok", failed: "fail", skipped: "pending" } as const;
const statusLabel = { sent: "Sent", failed: "Failed", skipped: "Skipped" } as const;

// Everyone's own email switches for the kinds that apply to them (0028: no row = on); lab Owner and Admin also read the
// last sends. The example workspace shows its lab view the demo log, where every row is skipped.
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await requireWorkspace("all");
  const { saved } = await searchParams;
  const staff = session.view === "staff";
  const showLog = mayReadNotificationLog(session);
  const [switches, log] = await Promise.all([myNotificationSwitches(session), showLog ? recentNotificationLog() : Promise.resolve([])]);
  const savedKind = saved?.replace(/-(on|off)$/, "");
  const savedOn = saved?.endsWith("-on");
  const config = notifyConfig();
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">{staff ? "Organization / Notifications" : "Client portal / Notifications"}</div>
        <h1>Notifications</h1>
        <p>The emails {staff ? "Lipidomics Admin" : "the lab"} sends you, from {"“"}Lipidomics · Libreros Lab{"”"}. Each one is on until you turn it off.
          {!staff && session.clients.length > 1 && ` Your choice applies to every client you belong to${session.selectedClient ? `, not only ${session.selectedClient.name}` : ""}.`}</p>
      </div>
    </div>
    {savedKind && isNotificationKind(savedKind) && <p className="notice success" role="status"><strong>{kindInfo[savedKind].label}: {savedOn ? "on" : "off"}.</strong> {savedOn ? "You get these emails again." : "You no longer get these emails."}</p>}
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
