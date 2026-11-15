import { billingLabels, kindLabels, type ClientRecord } from "@/lib/data/clients";
import { labRoleLabels, type LabPerson } from "@/lib/release";
import styles from "./clients.module.css";

export function DemoActor({ actors, id = "client-actor" }: { actors: LabPerson[] | null; id?: string }) {
  return actors && <div className="field"><label className="field-label" htmlFor={id}>Act as (demo)</label>
    <select id={id} name="actor" defaultValue={actors.find(person => person.role === "owner")?.userId}>{actors.map(person => <option key={person.userId} value={person.userId}>{person.name} · {labRoleLabels[person.role]}</option>)}</select>
    <small>Choose a demo Owner or Admin to manage clients.</small>
  </div>;
}
export function ClientFields({ client, actors }: { client?: ClientRecord; actors: LabPerson[] | null }) {
  return <>
    {client && <input type="hidden" name="clientId" value={client.id} />}
    <label className="field"><span className="field-label">Client name</span><input name="name" required defaultValue={client?.name ?? ""} /></label>
    <div className="field"><label className="field-label" htmlFor="client-kind">Kind</label><select id="client-kind" name="kind" defaultValue={client?.kind ?? "pi_lab"}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="field"><label className="field-label" htmlFor="client-billing">Billing method</label><select id="client-billing" name="billingMethod" defaultValue={client?.billingMethod ?? ""}><option value="">Not set</option>{Object.entries(billingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <label className="field"><span className="field-label">Notes</span><textarea className={styles.notes} name="notes" rows={3} defaultValue={client?.notes ?? ""} /></label>
    <DemoActor actors={actors} />
  </>;
}
