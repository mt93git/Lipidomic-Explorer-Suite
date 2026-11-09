"use client";

import { useActionState } from "react";
import { enterDemo, signIn } from "@/app/actions";

export function SignInForm({ mock }: { mock: boolean }) {
  const [state, action, pending] = useActionState(signIn, {});
  return <>
    <form action={action}>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <label className="field"><span className="field-label">Email</span><input name="email" type="email" autoComplete="username" placeholder="you@example.invalid" required disabled={mock || pending} /></label>
      <label className="field"><span className="field-label">Password</span><input name="password" type="password" autoComplete="current-password" required disabled={mock || pending} /></label>
      <label className="field"><span className="field-label">Two-step code</span><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="two-step-help" disabled={mock || pending} /></label>
      <p id="two-step-help" className="muted"><small>Required if two-step verification is enabled on your account.</small></p>
      <button className="button" disabled={mock || pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
    {mock && <form action={enterDemo} style={{ marginTop: 12 }}><button className="button">Enter example workspace</button><p className="sso-note">Demo access needs no email, password, or backend.</p></form>}
    <hr className="auth-divider" />
    <button className="button secondary" type="button" disabled aria-describedby="sso-note">Use Yale SSO</button>
    <p className="sso-note" id="sso-note">Yale SSO is not configured yet.</p>
  </>;
}
