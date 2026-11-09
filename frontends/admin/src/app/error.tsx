"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="auth-page"><section className="auth-card"><h1>Unable to load this page</h1><p className="muted">The workspace could not complete that request. Try again in a moment.</p><button className="button" onClick={reset}>Try again</button></section></div>;
}
