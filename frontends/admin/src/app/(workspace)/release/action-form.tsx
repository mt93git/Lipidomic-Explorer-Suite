"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { FormAlert } from "@/components/error-summary";
import type { ActionState } from "./actions";

type Action = (previous: ActionState, form: FormData) => Promise<ActionState>;

// One form per release action: the fields come from the server component, the submit shows its pending state
// and a refusal is shown next to it. On success the action redirects, so there is no success state here.
// keepValues: React empties the fields when the action ends; with it, a refusal puts back what was typed.
export function ActionForm({ action, submit, pendingLabel = "Working…", disabled = false, secondary = false, keepValues = false, className, children }:
  { action: Action; submit: string; pendingLabel?: string; disabled?: boolean; secondary?: boolean; keepValues?: boolean; className?: string; children?: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const typed = useRef<FormData | null>(null);
  useEffect(() => {
    const values = typed.current;
    typed.current = null;
    if (!state.error || !values || !form.current) return;
    for (const field of form.current.elements) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || ["hidden", "checkbox", "radio", "file"].includes(field.type)) continue;
      const value = values.get(field.name);
      if (typeof value === "string") field.value = value;
    }
  }, [state]);
  return <form ref={form} action={formAction} className={className} aria-busy={pending}
    onSubmit={keepValues ? event => { typed.current = new FormData(event.currentTarget); } : undefined}>
    {children}
    <button className={`button${secondary ? " secondary" : ""}`} disabled={pending || disabled}>{pending ? pendingLabel : submit}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
