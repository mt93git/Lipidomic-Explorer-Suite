"use client";

import { useActionState } from "react";
import Link from "@/components/app-link";
import { ErrorSummary, FormAlert } from "@/components/error-summary";
import { clientKindNames, clientKinds, type AccessForm } from "@/lib/access-requests";
import { requestAccessAction, type RequestAccessState } from "./actions";

const fieldLabels: [keyof AccessForm, string][] = [["fullName", "Full name"], ["email", "Work email"], ["organisation", "Organisation or lab"], ["kind", "Type"], ["message", "What would you like to measure?"]];

// Five fields and a trap field; noValidate so the server's error summary names every problem. After a send the
// card shows what happened in place of the form. The wording is the same whether or not the email has an account.
export function RequestAccessForm() {
  const [state, action, pending] = useActionState<RequestAccessState, FormData>(requestAccessAction, {});
  const outcome = state.outcome;
  if (outcome?.kind === "sent") return <>
    <h1 id="access-title">Request received.</h1>
    <p className="notice success" role="status"><strong>The lab has your request.</strong> It is reviewed by hand and the lab will write to {outcome.email}.</p>
    <p className="muted">{outcome.reference && <>Reference <span className="mono">{outcome.reference}</span>. </>}Nothing else is needed from you now. If the request is approved you will receive a link, valid for 7 days, to set your password.</p>
    <Link className="button secondary" href="/sign-in">Back to sign in</Link>
  </>;
  if (outcome?.kind === "pending") return <>
    <h1 id="access-title">Request already received.</h1>
    <p className="notice" role="status"><strong>A request for {outcome.email} is already waiting for the lab.</strong> You do not need to send another; it is reviewed by hand and the lab will write to that address.</p>
    <p className="muted">If something has changed, wait for the lab&apos;s answer and reply to it.</p>
    <Link className="button secondary" href="/sign-in">Back to sign in</Link>
  </>;
  const values = state.values;
  const error = (key: keyof AccessForm) => state.errors?.[key];
  const describe = (key: keyof AccessForm, hint?: boolean) => ({
    ...(error(key) ? { "aria-invalid": true as const } : {}),
    "aria-describedby": [hint ? `access-${key}-hint` : null, error(key) ? `access-${key}-error` : null].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (key: keyof AccessForm) => error(key) ? <small id={`access-${key}-error`} className="field-error">{error(key)}</small> : null;
  const refusal = outcome?.kind === "limited" ? "Too many requests were sent from here. Please wait an hour and try again."
    : outcome?.kind === "full" ? "The lab is not taking new requests right now. Please try again in a few days."
    : outcome?.kind === "unavailable" ? "Your request could not be sent. Please try again later." : null;
  // A refusal re-mounts the form with what was typed (React resets a form after its action).
  return <>
    <h1 id="access-title">Request access.</h1>
    <p className="muted">Tell the lab who you are. A lab administrator reviews every request by hand; if it is approved you receive a personal link to set your password. No account is created now.</p>
    <form action={action} className="record-form access-form" noValidate key={state.attempt ?? 0}>
      {refusal && <FormAlert>{refusal}</FormAlert>}
      <ErrorSummary fields={fieldLabels.filter(([key]) => error(key)).map(([key, label]) => ({ id: `access-${key}`, label }))} />
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="access-fullName">Full name</label>
          <input id="access-fullName" name="fullName" autoComplete="name" maxLength={200} required defaultValue={values?.fullName ?? ""} {...describe("fullName")} />
          {fieldError("fullName")}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="access-email">Work email</label>
          <input id="access-email" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={values?.email ?? ""} {...describe("email", true)} />
          <small id="access-email-hint" className="field-hint">The lab replies to this address.</small>
          {fieldError("email")}
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor="access-organisation">Organisation or lab</label>
          <input id="access-organisation" name="organisation" autoComplete="organization" maxLength={200} required defaultValue={values?.organisation ?? ""} {...describe("organisation", true)} />
          <small id="access-organisation-hint" className="field-hint">Your PI&apos;s lab, your group or your company.</small>
          {fieldError("organisation")}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="access-kind">Type</label>
          <select id="access-kind" name="kind" defaultValue={values?.kind || "pi_lab"} {...describe("kind", true)}>
            {clientKinds.map(kind => <option key={kind} value={kind}>{clientKindNames[kind]}</option>)}
          </select>
          <small id="access-kind-hint" className="field-hint">PI lab, internal group or company.</small>
          {fieldError("kind")}
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="access-message">What would you like to measure?</label>
        <textarea id="access-message" name="message" rows={3} maxLength={2000} defaultValue={values?.message ?? ""} {...describe("message", true)} />
        <small id="access-message-hint" className="field-hint">Optional. Do not include patient names or sample details.</small>
        {fieldError("message")}
      </div>
      <div className="trap" aria-hidden="true">
        <label htmlFor="access-website">Leave this empty</label>
        <input id="access-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="button" disabled={pending}>{pending ? "Sending…" : "Send request"}</button>
    </form>
    <p className="sso-note auth-switch">Already have an account? <Link href="/sign-in">Sign in →</Link></p>
  </>;
}
