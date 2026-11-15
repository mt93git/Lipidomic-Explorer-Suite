"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Validation feedback that does not leave a keyboard user on the page body. The summary names every field with a
// problem (links jump to the control) and moves the focus to the first invalid control once the action's errors
// arrive. FormAlert is the one-message variant for a refusal without field errors: it takes the focus itself.
export function ErrorSummary({ fields }: { fields: { id: string; label: string }[] }) {
  const first = fields[0]?.id;
  useEffect(() => { if (first) document.getElementById(first)?.focus(); }, [first, fields.length]);
  if (!fields.length) return null;
  return <div className="error error-summary" role="alert">
    <strong>{fields.length} field{fields.length === 1 ? " needs" : "s need"} attention.</strong>{" "}
    {fields.map((field, index) => <span key={field.id}>{index > 0 && " · "}<a href={`#${field.id}`}>{field.label}</a></span>)}
  </div>;
}

export function FormAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <p ref={ref} role="alert" className="error" tabIndex={-1}>{children}</p>;
}
