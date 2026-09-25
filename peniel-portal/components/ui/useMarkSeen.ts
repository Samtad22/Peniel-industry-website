"use client";

import { useEffect, useRef } from "react";
import { markTabSeen } from "@/app/_actions/tabs";

/**
 * When the open tab shows a badge, record that the person has seen it (once
 * per visit), which refreshes the counts. Badges that count work still
 * waiting (a proof to approve) stay until it's done.
 */
export function useMarkSeen(activeArea: string | null, badge: number, seenAreas: readonly string[]) {
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!activeArea) {
      marked.current = null;
      return;
    }
    if (marked.current === activeArea || !seenAreas.includes(activeArea)) return;
    if (badge > 0) {
      marked.current = activeArea;
      void markTabSeen(activeArea);
    }
  }, [activeArea, badge, seenAreas]);
}
