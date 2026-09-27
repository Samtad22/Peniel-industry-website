"use client";

import { useEffect } from "react";

/** Opens the print dialog once the page has loaded (reports opened with ?print=1). */
export default function AutoPrint() {
  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
