"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/error-summary";
import { twoStepSetupAction } from "./actions";

export function TwoStepSetupForm() {
  const [state, action, pending] = useActionState(twoStepSetupAction, {});
  if (!state.factorId) return <form action={action} aria-busy={pending}>
    <button className="button" disabled={pending}>{pending ? "Starting…" : "Show my QR code"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
  return <form action={action} aria-busy={pending}>
    <input type="hidden" name="factorId" value={state.factorId} />
    {/* GoTrue's QR code is an SVG data URL; an <img> never runs anything inside it. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={state.qrCode} alt="QR code for your authenticator app" width={200} height={200} style={{ display: "block", margin: "8px auto" }} />
    <p className="muted"><small>Cannot scan it? Enter this key in the app instead: <code>{state.secret}</code></small></p>
    <label className="field"><span className="field-label">Six-digit code</span>
      <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
    <button className="button" disabled={pending}>{pending ? "Checking…" : "Turn on two-step sign-in"}</button>
    {state.error && <FormAlert>{state.error}</FormAlert>}
  </form>;
}
