"use client";

import "./globals.css";

/** Last resort when the root layout itself fails: no app components, plain HTML. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans">
        <main className="flex min-h-screen items-center px-6">
          <div className="flex max-w-[520px] flex-col gap-4 border-l-4 border-accent pl-5">
            <h1 className="m-0 text-[36px]">Peniel Portal is having a problem</h1>
            <p className="m-0 text-[15px] opacity-80">
              Please try again in a minute. If it keeps happening, contact Peniel on +251 11 668 9255
              {error.digest ? ` and quote reference ${error.digest}` : ""}.
            </p>
            <button type="button" onClick={reset} className="btn btn-primary w-fit">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
