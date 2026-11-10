"use client";

import { useActionState } from "react";
import Link from "@/components/app-link";
import { FormAlert } from "@/components/error-summary";
import { acceptInvitationAction, acceptMyInvitationAction } from "./actions";

export function AcceptForm({ token, email, minPassword }: { token: string; email: string; minPassword: number }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, {});
  if (state.email) return <div role="status">
    <p className="notice success"><strong>Your account is ready.</strong> Sign in with {state.email} and the password you chose.</p>
    <Link className="button" href="/sign-in">Sign in →</Link>
  </div>;
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="token" value={token} />
    <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
    <label className="field"><span className="field-label">Password</span>
      <input name="password" type="password" autoComplete="new-password" minLength={minPassword} required aria-describedby="password-help" /></label>
    <label className="field"><span className="field-label">Repeat password</span>
      <input name="confirm" type="password" autoComplete="new-password" minLength={minPassword} required /></label>
    <p id="password-help" className="muted"><small>At least {minPassword} characters.</small></p>
    <button className="button" disabled={pending}>{pending ? "Setting up…" : "Set password and join"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}

// The invited email already has an account and is signed in on this browser: one button, no password.
export function AcceptMineForm({ token, target }: { token: string; target: string }) {
  const [state, action, pending] = useActionState(acceptMyInvitationAction, {});
  if (state.email) return <div role="status">
    <p className="notice success"><strong>You have joined as {target}.</strong> Your password has not changed.</p>
    <Link className="button" href="/">Continue →</Link>
  </div>;
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="token" value={token} />
    <button className="button" disabled={pending}>{pending ? "Joining…" : "Accept invitation"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
