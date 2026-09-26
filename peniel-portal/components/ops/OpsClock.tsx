"use client";

import { useEffect, useState } from "react";

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", weekday: "short", day: "numeric", month: "short" });

/** Plant time (Addis Ababa) at the foot of the rail, ticking every half minute. */
export default function OpsClock({ initial }: { initial: number }) {
  // The server's time first (so the page renders the same on both sides), then the browser's.
  const [now, setNow] = useState(() => (initial > 0 ? new Date(initial) : new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="flex items-baseline justify-between px-5 py-3.5">
      <span className="text-[32px] font-extrabold leading-none tracking-[-.04em]" suppressHydrationWarning>
        {time.format(now)}
      </span>
      <span className="text-right text-[11px] leading-[1.35] opacity-65" suppressHydrationWarning>
        {day.format(now).replace("Sept", "Sep")}
        <br />
        Addis Ababa
      </span>
    </div>
  );
}
