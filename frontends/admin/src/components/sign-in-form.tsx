"use client";

import { useActionState, useEffect } from "react";
import { enterDemo, signIn } from "@/app/actions";
import Link from "@/components/app-link";
import { leaveApp } from "@/lib/leave-app";
import { nexoReturnPath } from "@/lib/return-path";

// next: where to return after signing in, an invitation link or a Nexo path (the server checks it again). A Nexo path
// comes back in the state and the browser leaves the app for it; the link is there if that navigation does not happen.
export function SignInForm({ mock, next }: { mock: boolean; next?: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  useEffect(() => { if (state.next) leaveApp(state.next); }, [state.next]);
  const forgot = nexoReturnPath(next);
  return <>
    <form action={action}>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.next && <p className="notice success" role="status">Signed in. <a href={state.next}>Continue to Nexo →</a></p>}
      {next && <input type="hidden" name="next" value={next} />}
      <label className="field"><span className="field-label">Email</span><input name="email" type="email" autoComplete="username" placeholder="you@example.invalid" required disabled={mock || pending} /></label>
      <label className="field"><span className="field-label">Password</span><input name="password" type="password" autoComplete="current-password" required disabled={mock || pending} /></label>
      <label className="field"><span className="field-label">Two-step code</span><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="two-step-help" disabled={mock || pending} /></label>
      <p id="two-step-help" className="muted"><small>Required if two-step verification is enabled on your account.</small></p>
      <button className="button" disabled={mock || pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="auth-forgot"><Link href={forgot ? `/forgot-password?next=${encodeURIComponent(forgot)}` : "/forgot-password"}>Forgot your password?</Link></p>
    </form>
    {mock && <form action={enterDemo} style={{ marginTop: 12 }}>
      <button className="button">Enter example workspace</button>
      <button className="button secondary" name="view" value="client" style={{ marginTop: 8 }}>Enter as an example client</button>
      <p className="sso-note">Demo access needs no email, password, or backend.</p>
    </form>}
    <hr className="auth-divider" />
    <button className="button secondary" type="button" disabled aria-describedby="sso-note">Use Yale SSO</button>
    <p className="sso-note" id="sso-note">Yale SSO is not configured yet.</p>
  </>;
}
