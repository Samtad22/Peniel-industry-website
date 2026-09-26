"use client";

import { useSyncExternalStore } from "react";

export type PoField = { key: string; label: string; order: string };
type Mark = "ok" | "bad";

// Ticks live in this browser only (per order), so they survive a reload while
// someone reads the PO. They are a checking aid, not a record.
const storeKey = (orderId: string) => `po-check:${orderId}`;
const listeners = new Set<() => void>();

function read(orderId: string): Record<string, Mark> {
  try {
    return JSON.parse(window.localStorage.getItem(storeKey(orderId)) ?? "{}") as Record<string, Mark>;
  } catch {
    return {};
  }
}
function write(orderId: string, marks: Record<string, Mark>) {
  try {
    window.localStorage.setItem(storeKey(orderId), JSON.stringify(marks));
  } catch {
    // Private mode or storage blocked: the ticks just won't be remembered.
  }
  cache.delete(orderId);
  listeners.forEach((l) => l());
}
const cache = new Map<string, { raw: string; value: Record<string, Mark> }>();
function snapshot(orderId: string): Record<string, Mark> {
  let raw = "{}";
  try {
    raw = window.localStorage.getItem(storeKey(orderId)) ?? "{}";
  } catch {}
  const hit = cache.get(orderId);
  if (hit && hit.raw === raw) return hit.value;
  const value = read(orderId);
  cache.set(orderId, { raw, value });
  return value;
}
const EMPTY: Record<string, Mark> = {};

/**
 * "4/5 fields match the PO" (design 2c). Staff read the PO beside the order
 * and tick each field as matching or not; the score and the warning follow.
 */
export default function PoCheck({ orderId, fields }: { orderId: string; fields: PoField[] }) {
  const marks = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot(orderId),
    () => EMPTY,
  );
  const set = (key: string, m: Mark) => write(orderId, { ...marks, [key]: marks[key] === m ? undefined : m } as Record<string, Mark>);
  const ok = fields.filter((f) => marks[f.key] === "ok").length;
  const bad = fields.filter((f) => marks[f.key] === "bad");
  const checked = ok + bad.length;

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] items-center gap-6 border-b-2 border-divider px-4 py-[22px] sm:px-7">
        <div className="text-[56px] font-extrabold leading-[.85] tracking-[-.05em] sm:text-[72px]">
          {ok}
          <span className="text-[28px] opacity-40 sm:text-[36px]">/{fields.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          <b className="text-[17px]">{checked < fields.length ? `fields checked against the PO (${checked} of ${fields.length} done)` : "fields match the uploaded PO"}</b>
          <div className="flex gap-1" aria-hidden="true">
            {fields.map((f) => (
              <span key={f.key} className={`h-2.5 w-7 ${marks[f.key] === "ok" ? "bg-text" : marks[f.key] === "bad" ? "bg-accent" : "bg-neutral-300"}`} />
            ))}
          </div>
          <span className={`text-[13px] ${bad.length ? "text-accent-800" : "opacity-70"}`}>
            {bad.length
              ? `${bad.map((f) => f.label).join(", ")} ${bad.length === 1 ? "doesn't" : "don't"} match. Clarify with the customer before you confirm.`
              : checked < fields.length
                ? "Read the PO and tick each field: ✓ matches, ! doesn't."
                : "Everything matches. Set the due date and confirm."}
          </span>
        </div>
      </div>
      <div className="px-4 pt-1 sm:px-7">
        <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_88px] gap-3 border-b-2 border-text pb-2 pt-2.5 text-[11px] uppercase tracking-[.08em] text-neutral-700 sm:grid-cols-[130px_minmax(0,1fr)_96px]">
          <span>Field</span>
          <span>Order says</span>
          <span>PO says</span>
        </div>
        {fields.map((f) => {
          const m = marks[f.key];
          return (
            <div
              key={f.key}
              className={`grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_88px] items-center gap-3 border-b border-divider py-2.5 text-[14px] sm:grid-cols-[130px_minmax(0,1fr)_96px] ${m === "bad" ? "bg-accent-100" : ""}`}
            >
              <span className="opacity-70">{f.label}</span>
              <b className="min-w-0 whitespace-pre-line break-words">{f.order}</b>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => set(f.key, "ok")}
                  aria-pressed={m === "ok"}
                  aria-label={`${f.label} matches the PO`}
                  className={`grid size-9 cursor-pointer place-items-center border-2 text-[13px] font-extrabold ${m === "ok" ? "border-text bg-text text-bg" : "border-divider bg-transparent text-text hover:border-text"}`}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => set(f.key, "bad")}
                  aria-pressed={m === "bad"}
                  aria-label={`${f.label} doesn't match the PO`}
                  className={`grid size-9 cursor-pointer place-items-center border-2 text-[13px] font-extrabold ${m === "bad" ? "border-accent bg-accent text-bg" : "border-divider bg-transparent text-text hover:border-accent"}`}
                >
                  !
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
