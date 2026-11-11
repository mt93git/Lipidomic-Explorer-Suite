"use client";

import { useActionState } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import { resetPasswordAction, type ResetState } from "./actions";

// reset: the Forgot password email's link; activate: the activation email's (/activate), the same recovery link.
export type Purpose = "reset" | "activate";

// The link that cannot be used: the opened link was malformed, or the server refused its token on submit.
export function ExpiredLink({ purpose = "reset" }: { purpose?: Purpose }) {
  if (purpose === "activate") return <>
    <h1 id="reset-title">This activation link no longer works.</h1>
    <p className="notice error" role="alert"><strong>It has expired or was already used.</strong> An activation link works once, for one hour; a newer email replaces it.</p>
    <p className="muted">Ask the lab to send you a new activation email, or ask for a reset link yourself with the email address the lab has for you.</p>
    <Link className="button" href="/forgot-password">Ask for a reset link</Link>
    <p className="sso-note auth-switch">Already have a password? <Link href="/sign-in">Sign in →</Link></p>
  </>;
  return <>
    <h1 id="reset-title">This reset link no longer works.</h1>
    <p className="notice error" role="alert"><strong>It has expired or was already used.</strong> A reset link works once, for one hour; asking again replaces an earlier link.</p>
    <p className="muted">Ask for a new link and use it within the hour. Your password has not changed.</p>
    <Link className="button" href="/forgot-password">Ask for a new link</Link>
    <p className="sso-note auth-switch">Remembered it? <Link href="/sign-in">Sign in →</Link></p>
  </>;
}

// New password and repeat (the invitation page's rules).
export function ResetForm({ tokenHash, minPassword, purpose = "reset" }: { tokenHash: string; minPassword: number; purpose?: Purpose }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  const activate = purpose === "activate";
  if (state.expired) return <ExpiredLink purpose={purpose} />;
  if (state.spent) return <>
    <h1 id="reset-title">Your password was not {activate ? "set" : "changed"}.</h1>
    <FormAlert>{state.error}</FormAlert>
    <Link className="button" href="/forgot-password">Ask for a new link</Link>
    <p className="sso-note auth-switch"><Link href="/sign-in">Back to sign in →</Link></p>
  </>;
  return <>
    {activate ? <>
      <h1 id="reset-title">Welcome to Lipidomics{"\u00a0"}· Choose your password</h1>
      <p className="muted">This link works once. Then you sign in with your email and this password.</p>
    </> : <>
      <h1 id="reset-title">Choose a new password.</h1>
      <p className="muted">This link works once. After the change you sign in again with the new password.</p>
    </>}
    <form action={action} aria-busy={pending} key={state.attempt ?? 0}>
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="purpose" value={purpose} />
      <label className="field"><span className="field-label">{activate ? "Password" : "New password"}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={minPassword} required aria-describedby="reset-password-help" /></label>
      <label className="field"><span className="field-label">{activate ? "Repeat password" : "Repeat new password"}</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required /></label>
      <p id="reset-password-help" className="muted"><small>At least {minPassword} characters.</small></p>
      <button className="button" disabled={pending}>{pending ? (activate ? "Saving…" : "Changing…") : activate ? "Choose password" : "Change password"}</button>
    </form>
  </>;
}
