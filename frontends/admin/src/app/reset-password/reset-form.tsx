"use client";

import { useActionState } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import { resetPasswordAction, type ResetState } from "./actions";

// The link that cannot be used: the opened link was malformed, or the server refused its token on submit.
export function ExpiredLink() {
  return <>
    <h1 id="reset-title">This reset link no longer works.</h1>
    <p className="notice error" role="alert"><strong>It has expired or was already used.</strong> A reset link works once, for one hour; asking again replaces an earlier link.</p>
    <p className="muted">Ask for a new link and use it within the hour. Your password has not changed.</p>
    <Link className="button" href="/forgot-password">Ask for a new link</Link>
    <p className="sso-note auth-switch">Remembered it? <Link href="/sign-in">Sign in →</Link></p>
  </>;
}

// New password and repeat (the invitation page's rules), and the two-step code for an account that has one.
export function ResetForm({ tokenHash, minPassword }: { tokenHash: string; minPassword: number }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  if (state.expired) return <ExpiredLink />;
  if (state.spent) return <>
    <h1 id="reset-title">Your password was not changed.</h1>
    <FormAlert>{state.error}</FormAlert>
    <Link className="button" href="/forgot-password">Ask for a new link</Link>
    <p className="sso-note auth-switch"><Link href="/sign-in">Back to sign in →</Link></p>
  </>;
  return <>
    <h1 id="reset-title">Choose a new password.</h1>
    <p className="muted">This link works once. After the change you sign in again with the new password.</p>
    <form action={action} aria-busy={pending} key={state.attempt ?? 0}>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <input type="hidden" name="token_hash" value={tokenHash} />
      <label className="field"><span className="field-label">New password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={minPassword} required aria-describedby="reset-password-help" /></label>
      <label className="field"><span className="field-label">Repeat new password</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required /></label>
      <p id="reset-password-help" className="muted"><small>At least {minPassword} characters.</small></p>
      <label className="field"><span className="field-label">Two-step code</span>
        <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="reset-code-help" /></label>
      <p id="reset-code-help" className="muted"><small>Required if two-step verification is enabled on your account (lab staff). Clients without it leave this empty.</small></p>
      <button className="button" disabled={pending}>{pending ? "Changing…" : "Change password"}</button>
    </form>
  </>;
}
