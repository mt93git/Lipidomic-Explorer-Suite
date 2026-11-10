"use client";

import { useState } from "react";

// A SHA-256 as people use it: twelve leading and six trailing characters to recognise it, a copy button for
// the whole value, and the full digest behind a disclosure for reading or auditing.
export function Digest({ sha, label }: { sha: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!sha) return <span className="muted">not recorded</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(sha); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* no clipboard access: the full digest is one click away in the disclosure */ }
  };
  return <div className="sha">
    <span className="sha-short">{`${sha.slice(0, 12)}…${sha.slice(-6)}`}</span>
    <button type="button" className="link-button" aria-label={`Copy SHA-256 of ${label}`} onClick={copy}>{copied ? "Copied" : "copy"}</button>
    <details className="sha-full"><summary>Full digest</summary><span>{sha}</span></details>
  </div>;
}
