"use client";

import { useEffect, useState } from "react";

/** A dialog opened by a trigger; closes on Escape, the backdrop, or `close()`. */
export default function Modal({
  trigger,
  title,
  children,
  wide,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  children: (close: () => void) => React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const id = `m-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className={`dialog max-h-[92vh] overflow-y-auto ${wide ? "!w-[min(620px,100%)]" : "!w-[min(520px,100%)]"}`} role="dialog" aria-modal="true" aria-labelledby={id}>
            <div id={id} className="dialog-title">
              {title}
            </div>
            {children(() => setOpen(false))}
          </div>
        </div>
      )}
    </>
  );
}
