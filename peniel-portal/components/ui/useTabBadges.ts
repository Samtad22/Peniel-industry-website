"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadTabBadges, markTabSeen } from "@/app/_actions/tabs";

const REFRESH_MS = 60_000;

/**
 * Tab badges that stay current: fetched again on every page change, when the
 * window comes back into focus, and every minute. A tab's "new" badge stays
 * on while the person is on that tab and clears when they leave it (its
 * updates have been seen). Badges that count work waiting, like a proof to
 * approve, stay until the work is done.
 */
export function useTabBadges(
  initial: Record<string, number>,
  asOf: number,
  activeArea: string | null,
  seenAreas: readonly string[],
): Record<string, number> {
  // Counts fetched in the browser replace the server's until the server renders the layout again
  // (a new asOf). Compared by asOf, not by clock, so a computer with a wrong clock still works.
  const [fetched, setFetched] = useState<{ base: number; badges: Record<string, number> } | null>(null);
  const badges = fetched && fetched.base === asOf ? fetched.badges : initial;
  const asOfRef = useRef(asOf);
  const latest = useRef(badges);

  const refresh = useCallback(() => {
    const base = asOfRef.current;
    loadTabBadges()
      .then((b) => b && setFetched({ base, badges: b }))
      .catch(() => {});
  }, []);

  // The tab being looked at, and whether it showed news during this visit.
  const visit = useRef<{ area: string | null; hadNews: boolean; started: boolean }>({ area: null, hadNews: false, started: false });

  // Runs before the effect below (same render), so the tab just opened knows its badge.
  useEffect(() => {
    asOfRef.current = asOf;
    latest.current = badges;
    const v = visit.current;
    if (v.area && (badges[v.area] ?? 0) > 0) v.hadNews = true;
  }, [asOf, badges]);

  useEffect(() => {
    const v = visit.current;
    if (v.started && v.area === activeArea) return;
    const leaving = v.started && v.area && v.hadNews && seenAreas.includes(v.area) ? markTabSeen(v.area) : null;
    const first = !v.started;
    visit.current = { area: activeArea, hadNews: !!activeArea && (latest.current[activeArea] ?? 0) > 0, started: true };
    // First load: the server just counted. After that, count again (after recording the tab just left).
    if (!first) void (leaving ?? Promise.resolve()).finally(refresh);
  }, [activeArea, refresh, seenAreas]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return badges;
}
