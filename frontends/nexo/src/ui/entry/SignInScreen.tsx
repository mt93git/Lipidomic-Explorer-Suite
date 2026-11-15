import { useRef, useState, type FormEvent } from 'react';
import { adminBase } from '../../api/adminBase';
import { signIn } from '../../api/adminSignIn';
import { strings } from '../strings';
import './SignInScreen.css';

export function SignInScreen({ onSignedIn, signedOutFrom }: { onSignedIn: () => void; signedOutFrom?: string }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [step, setStep] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const secret = useRef<HTMLInputElement>(null); // the password, or the code on step 2: the field to fix after a refusal
  const next = encodeURIComponent(globalThis.location?.pathname + (globalThis.location?.search || '') + (globalThis.location?.hash || ''));
  async function submit(value?: string) {
    if (busy) return;
    if (!email.trim()) { setError('Enter the email on your invitation.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError('');
    const result = await signIn({ email: email.trim(), password, ...(step ? { code: value ?? code } : {}) });
    setBusy(false);
    if (result === 'ok') { setPassword(''); setCode(''); onSignedIn(); }
    else if (result === 'code_required') { setStep(true); setCode(''); }
    else {
      if (result === 'invalid_code') { setError('That code did not match. Codes change every 30 seconds: enter the newest one.'); setCode(''); }
      else if (result === 'invalid_credentials') setError('Email or password is not right. Check both, or reset your password.');
      else setError('Sign in is unavailable. Please try again later.');
      secret.current?.focus();
    }
  }
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(); };
  return <div className="entry-signin"><header className="entry-signin-bar"><img src={`${import.meta.env.BASE_URL}entry/libreros-lab-logo.webp`} alt="Libreros Lab"/><span>{strings.app}</span></header><main className="entry-signin-main"><section className="entry-signin-card" aria-label="Sign in">
    {signedOutFrom && <p role="status" className="entry-signin-notice">You were signed out. Sign in to go back to {signedOutFrom}.</p>}
    {step ? <><div className="entry-signin-who">{email} <button type="button" onClick={() => { setStep(false); setCode(''); setError(''); }}>Not you?</button></div><p>Step 2 of 2</p><h1>Enter your 6-digit code</h1><p>Open your authenticator app and type the code for Lipidomic Explorer.</p></> : <><h1>Your analysis starts here</h1><p>Sign in to open your private projects.</p></>}
    <form onSubmit={onSubmit} noValidate>{step ? <label>6-digit code<input ref={secret} autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} aria-invalid={!!error} onChange={e => { const value = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(value); setError(''); if (value.length === 6) void submit(value); }}/></label> : <><label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input ref={secret} type="password" autoComplete="current-password" value={password} aria-invalid={!!error} onChange={e => setPassword(e.target.value)}/></label></>}
    {error && <p className="entry-signin-error" role="alert">{error}</p>}<button className="entry-signin-primary" disabled={busy} type="submit">{step ? 'Verify and sign in' : 'Continue'}</button></form>
    {step ? <p>No authenticator at hand? Ask your lab contact to reset it.</p> : <div className="entry-signin-links"><a href={`${adminBase}/forgot-password?next=${next}`}>Forgot password?</a><a href={`${adminBase}/forgot-password?next=${next}`}>First time here?</a><p>We email you a link to choose your password.</p></div>}
  </section></main></div>;
}
