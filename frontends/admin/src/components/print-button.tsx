"use client";

// Opens the browser's print dialog (Print labels); no label printer integration.
export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" className="button" onClick={() => window.print()}>{label}</button>;
}
