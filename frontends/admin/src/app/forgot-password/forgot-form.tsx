"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import { signInHref } from "@/lib/return-path";
import { forgotPasswordAction, type ForgotState } from "./actions";

// One email field; noValidate so the server's message is the one shown. After a send the card shows the same
// neutral message whether or not the email has an account.
// next: a Nexo path (already checked) the links back to sign in carry.
export function ForgotForm({ sentMessage, next }: { sentMessage: string; next?: string }) {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.error) input.current?.focus(); }, [state.error, state.attempt]);
  if (state.outcome === "sent") return <>
    <h1 id="forgot-title">Check your email.</h1>
    <p className="notice success" role="status">{sentMessage}</p>
    <p className="muted">Nothing arrived after a few minutes? Check your spam folder, then ask again. If you never asked, nothing changes.</p>
    {state.demoLink && <p className="notice">Example only: no email is sent. <Link href={state.demoLink}>Open the reset link →</Link></p>}
    <Link className="button secondary" href={signInHref(next)}>Back to sign in</Link>
  </>;
  const refusal = state.outcome === "limited" ? "Too many reset requests were sent from here. Please wait an hour and try again."
    : state.outcome === "unavailable" ? "Password reset is unavailable right now. Please try again later, or contact the lab." : null;
  return <>
    <h1 id="forgot-title">Forgot your password?</h1>
    <p className="muted">Enter the email you sign in with. We will send a link to choose a new password.</p>
    <form action={action} className="record-form" noValidate key={state.attempt ?? 0} aria-busy={pending}>
      {refusal && <FormAlert>{refusal}</FormAlert>}
      <div className="field">
        <label className="field-label" htmlFor="forgot-email">Email</label>
        <input id="forgot-email" name="email" type="email" autoComplete="username" maxLength={254} required defaultValue={state.email ?? ""}
          {...(state.error ? { "aria-invalid": true as const, "aria-describedby": "forgot-email-error" } : {})} ref={input} />
        {state.error && <small id="forgot-email-error" className="field-error">{state.error}</small>}
      </div>
      <button className="button" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
    <p className="sso-note auth-switch">Remembered it? <Link href={signInHref(next)}>Sign in →</Link></p>
  </>;
}
