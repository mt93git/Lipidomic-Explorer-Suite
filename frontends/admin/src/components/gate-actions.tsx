"use client";

import { useState } from "react";
import Link from "next/link";

export function GateActions({ ready, nextStage, reviewHref }: { ready: boolean; nextStage: string; reviewHref: string }) {
  const [preview, setPreview] = useState(false);
  return <>
    <div className="gate-actions">
      <Link className="button secondary" href={reviewHref}>Review gate items</Link>
      <button className="button" disabled={!ready} onClick={() => setPreview(true)}>Preview advance →</button>
    </div>
    {preview && <p className="notice" role="status">All checks are clear. The next transition would be “{nextStage}”. This preview does not change the order or create a signature.</p>}
    <p className="muted"><small>{ready ? "Gate actions are previews in this example workspace." : "Resolve failed and pending checks before advancing."} Workflow updates arrive in the phase shown on the review screen.</small></p>
  </>;
}
