import { labRoleLabels, type LabPerson } from "@/lib/release";

// Demo only: which synthetic lab person the form acts as (live mode acts as the signed-in user).
export function DemoActor({ actors, id, hint }: { actors: LabPerson[] | null; id: string; hint: string }) {
  return actors && <div className="field"><label className="field-label" htmlFor={id}>Act as (demo)</label>
    <select id={id} name="actor" defaultValue={actors.find(person => person.role === "owner")?.userId}>{actors.map(person => <option key={person.userId} value={person.userId}>{person.name} · {labRoleLabels[person.role]}</option>)}</select>
    <small>{hint}</small>
  </div>;
}
