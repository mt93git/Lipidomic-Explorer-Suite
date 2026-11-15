"use client";

// Opens the browser's print dialog for the box map page (a09 Print box map).
export function PrintButton() {
  return <button type="button" className="button" onClick={() => window.print()}>Print</button>;
}
