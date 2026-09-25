"use client";

import { useEffect } from "react";
import StatePanel from "@/components/ui/StatePanel";

/** Shown when a page fails to load. Nothing technical reaches the screen. */
export default function ErrorPanel({
  error,
  reset,
  home,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home: { href: string; label: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePanel
      code="Something went wrong"
      title="This page didn't load"
      action={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="btn btn-primary btn-split min-w-[180px]">
            Try again<span aria-hidden="true">↻</span>
          </button>
          <a href={home.href} className="btn btn-secondary btn-split min-w-[180px] text-text">
            {home.label}
            <span aria-hidden="true">→</span>
          </a>
        </div>
      }
    >
      Your data is safe. Try again, and if it keeps happening, tell Peniel
      {error.digest ? (
        <>
          {" "}
          and quote reference <span className="font-mono">{error.digest}</span>
        </>
      ) : null}
      .
    </StatePanel>
  );
}
