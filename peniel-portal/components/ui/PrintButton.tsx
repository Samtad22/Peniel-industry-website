"use client";

/** Opens the browser's print dialog (choose "Save as PDF" to keep a copy). */
export default function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary btn-split">
      {label}
      <span aria-hidden="true">⎙</span>
    </button>
  );
}
