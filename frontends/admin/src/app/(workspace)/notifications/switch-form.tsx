"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import type { NotificationKind } from "@/lib/notifications";
import { setNotificationAction, type SwitchState } from "./actions";
import styles from "./notifications.module.css";

// One switch: its state and the button that flips it. A plain form, so it works before the page's script loads.
export function SwitchForm({ kind, label, description, enabled }: { kind: NotificationKind; label: string; description: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<SwitchState, FormData>(setNotificationAction, {});
  const id = `switch-${kind}`;
  return <form action={action} className={styles.switch} aria-labelledby={`${id}-label`} aria-busy={pending}>
    <div className={styles.what}>
      <h3 id={`${id}-label`}>{label}</h3>
      <p className="muted" id={`${id}-description`}>{description}</p>
    </div>
    <span className={`pill ${enabled ? "ok" : "pending"}`} data-testid={`${kind}-state`}>{enabled ? "On" : "Off"}</span>
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="enabled" value={String(!enabled)} />
    <button className={`button${enabled ? " secondary" : ""}`} disabled={pending} aria-describedby={`${id}-label`}>{pending ? "Saving…" : enabled ? "Turn off" : "Turn on"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
