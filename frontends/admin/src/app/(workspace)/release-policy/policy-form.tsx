"use client";

import { useActionState, useState } from "react";
import { FormAlert } from "@/components/error-summary";
import { labRoleLabels, type LabPerson, type ReleasePolicy } from "@/lib/release";
import { setReleasePolicyAction } from "./actions";
import styles from "../release/release.module.css";

// The Owner's form: tick who may sign, set how many signatures a release needs. An empty list means any lab
// Owner or Admin may sign. The count must stay at or below the number of ticked people (unless none are ticked).
export function PolicyForm({ policy, staff, demoActors }: { policy: ReleasePolicy; staff: LabPerson[]; demoActors: LabPerson[] | null }) {
  const [state, action, pending] = useActionState(setReleasePolicyAction, {});
  const [chosen, setChosen] = useState<string[]>(policy.eligibleSigners);
  const [required, setRequired] = useState(policy.requiredSignatures);
  const toggle = (id: string) => setChosen(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const tooFew = chosen.length > 0 && chosen.length < required;
  return <form action={action} className={styles.form} aria-busy={pending}>
    {demoActors && <label className={styles.actor}>Set as<small> · example workspace: only the demo Owner may save</small>
      <select name="actor" defaultValue={demoActors.find(person => person.role === "owner")?.userId ?? ""}>{demoActors.map(person => <option key={person.userId} value={person.userId}>{person.name} · {labRoleLabels[person.role]}</option>)}</select>
    </label>}
    <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="eyebrow">Eligible signers</legend>
      {staff.map(person => <label key={person.userId} style={{ gridTemplateColumns: "auto 1fr", alignItems: "center" }}>
        <input type="checkbox" name="signer" value={person.userId} checked={chosen.includes(person.userId)} onChange={() => toggle(person.userId)} disabled={pending} style={{ width: "auto" }} />
        <span>{person.name} <small className="muted">· {labRoleLabels[person.role]}</small></span>
      </label>)}
      <p className="muted"><small>{chosen.length ? `${chosen.length} chosen.` : "Nobody chosen: any lab Owner or Admin may sign."}</small></p>
    </fieldset>
    <label htmlFor="policy-required">Required signatures</label>
    <input id="policy-required" name="required" type="number" min={2} max={Math.max(2, staff.length)} step={1} value={required} onChange={event => setRequired(Number(event.target.value) || 2)} disabled={pending} required className={styles.count} aria-invalid={tooFew || undefined} />
    {tooFew && <p className="error error-summary" role="alert"><strong>Fewer eligible signers ({chosen.length}) than required signatures ({required}).</strong> Tick more people or lower <a href="#policy-required">Required signatures</a>.</p>}
    <button className="button" disabled={pending || required < 2 || tooFew}>{pending ? "Saving…" : "Save policy"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
