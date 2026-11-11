"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import type { PersonKind } from "@/lib/people";
import type { LabPerson } from "@/lib/release";
import { sendActivationAction, type ActivationState } from "./actions";
import { DemoActor } from "./demo-actor";
import styles from "./people.module.css";

// "Send activation email" (or "Resend") for an account that has not signed in to Admin; lab Owner or Admin only.
// What happened (emailed, or why not) stays under the button.
export function ActivationForm({ kind, id, name, resend, actors }: { kind: PersonKind; id: string; name: string; resend: boolean; actors: LabPerson[] | null }) {
  const [state, action, pending] = useActionState<ActivationState, FormData>(sendActivationAction, {});
  return <form action={action} className={styles.activate} aria-busy={pending} aria-label={`Activation email for ${name}`}>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <DemoActor actors={actors} id={`activation-actor-${kind}-${id}`} hint="An Owner or Admin sends activation emails." />
    <button className={`button secondary ${styles.activateButton}`} disabled={pending}>
      {pending ? "Sending…" : resend ? "Resend" : "Send activation email"}<span className="sr-only"> to {name}</span>
    </button>
    {state.note && <p className={state.sent ? "notice success" : "notice"} role="status">{state.note}</p>}
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
