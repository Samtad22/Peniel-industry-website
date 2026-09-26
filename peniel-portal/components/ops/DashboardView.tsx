import { Bell, Search } from "lucide-react";
import Link from "next/link";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import { formatQty } from "@/lib/format";

export type QueueKind = "confirm" | "proof" | "message" | "pickup" | "held" | "hold";

export type DashboardData = {
  /** "GOOD AFTERNOON, SELAM · SAT 26 SEP" */
  hello: string;
  /** One plain sentence: what needs doing now. */
  headline: string;
  actions: { label: string; href: string }[];
  kpis: { label: string; n: number; sub: string; href: string; warn?: boolean }[];
  queue: { kind: QueueKind; title: string; meta: string; cta: string; href: string }[];
  week: { day: string; date: string; today: boolean; chips: { label: string; href: string; kind: "due" | "pickup" | "hold" }[] }[];
  weekSummary: string;
  volume: { name: string; total: number; stock: number; open: number; hold: number }[];
};

const TAG: Record<QueueKind, { label: string; className: string }> = {
  confirm: { label: "Confirm order", className: "bg-accent text-bg" },
  proof: { label: "Proof overdue", className: "bg-accent-800 text-bg" },
  message: { label: "Message", className: "border border-text" },
  pickup: { label: "Pickup", className: "bg-text text-bg" },
  held: { label: "Batch held", className: "bg-accent-800 text-bg" },
  hold: { label: "On hold", className: "border border-accent-700 text-accent-700" },
};

const CHIP = {
  pickup: "bg-text text-bg",
  due: "border border-accent text-accent-700",
  hold: "bg-accent-100 text-accent-800",
};

function SectionHead({ title, aside }: { title: string; aside: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-2 border-text pb-2.5">
      <h2 className="m-0 text-[26px] sm:text-[32px]">{title}</h2>
      <span className="text-right text-[13px] opacity-70">{aside}</span>
    </div>
  );
}

/** Peniel Ops home, v2 "Sales home" (design 2a): a poster sentence, display numerals, the queue and the week. */
export default function DashboardView({ d }: { d: DashboardData }) {
  return (
    <>
      <OpsTopBar>
        <form action="/ops/orders" role="search" className="relative hidden sm:block">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" />
          <input name="q" type="search" aria-label="Search orders" placeholder="Search orders, PO numbers, customers" className="input !w-[340px] !pl-8 xl:!w-[380px]" />
        </form>
        <a href="#queue" className="flex items-center gap-1.5 text-[13px] text-text no-underline" aria-label={`${d.queue.length} actions waiting`}>
          <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
          {d.queue.length > 0 && <b className="bg-accent px-1.5 text-[11px] text-bg">{d.queue.length}</b>}
        </a>
      </OpsTopBar>

      <div className="grid bg-accent text-bg lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5 px-4 py-8 sm:px-10 sm:pb-9 sm:pt-10">
          <span className="font-mono text-[11px] font-semibold tracking-[.1em]">{d.hello}</span>
          <h1 className="m-0 max-w-[760px] text-balance text-[44px] leading-[.92] tracking-[-.04em] text-bg sm:text-[64px] xl:text-[76px]">{d.headline}</h1>
          {d.actions.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {d.actions.map((a, i) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className={`btn w-full justify-between px-4 text-[15px] sm:w-[240px] ${
                    i === 0 ? "bg-bg py-3.5 !text-text hover:bg-neutral-200" : "border-2 border-bg py-3 !text-bg hover:bg-bg/10"
                  }`}
                >
                  {a.label}
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="relative hidden min-h-[240px] border-l-2 border-accent-700 lg:block" aria-hidden="true">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-80 mix-blend-multiply grayscale"
            style={{ backgroundImage: "url(/img/factory-exterior.jpg)" }}
          />
          <span className="absolute bottom-3.5 left-4 font-mono text-[10px] font-semibold tracking-[.1em]">BOLE LEMI · PLANT 1</span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b-2 border-divider sm:grid-cols-3 xl:grid-cols-5">
        {d.kpis.map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            className={`flex flex-col gap-2.5 border-divider px-4 py-5 text-text no-underline hover:bg-text/[.05] hover:text-text sm:px-6 ${
              i ? "border-l-2" : ""
            } max-sm:[&:nth-child(odd)]:border-l-0 max-xl:border-b-2 xl:first:pl-8`}
          >
            <h6 className="m-0 opacity-60">{k.label}</h6>
            <span className="text-[56px] font-extrabold leading-[.9] tracking-[-.05em] sm:text-[80px]">{k.n}</span>
            <span className={`text-[13px] ${k.warn ? "font-extrabold text-accent-700" : ""}`}>{k.sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section id="queue" className="scroll-mt-4 border-divider px-4 pb-9 pt-7 sm:px-8 lg:border-r-2">
          <SectionHead title="Your queue" aside={d.queue.length ? `${d.queue.length} ${d.queue.length === 1 ? "action" : "actions"} · most urgent first` : "Nothing waiting"} />
          {d.queue.length === 0 && <p className="m-0 border-b border-divider py-4 text-[14px] opacity-60">Nothing is waiting for you. New orders, proofs and messages show up here.</p>}
          {d.queue.map((q, i) => {
            const tag = TAG[q.kind];
            return (
              <div
                key={`${q.kind}-${q.href}-${i}`}
                className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 border-b border-divider py-4 sm:grid-cols-[64px_minmax(0,1fr)_180px]"
              >
                <span className={`text-[30px] font-extrabold tracking-[-.04em] sm:text-[36px] ${i < 2 ? "text-accent" : "text-neutral-400"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex min-w-0 flex-col gap-[5px]">
                  <span className={`self-start px-[7px] py-0.5 text-[10px] font-extrabold uppercase tracking-[.08em] ${tag.className}`}>{tag.label}</span>
                  <b className="text-[17px]">{q.title}</b>
                  <span className="text-[13px] opacity-70">{q.meta}</span>
                </div>
                <Link href={q.href} className={`btn col-start-2 justify-between sm:col-start-auto ${i === 0 ? "btn-primary" : "btn-secondary !text-text"}`}>
                  {q.cta}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            );
          })}
        </section>

        <div className="flex flex-col gap-7 px-4 pb-9 pt-7 sm:px-8">
          <section>
            <SectionHead title="This week" aside={d.weekSummary} />
            <div className="grid grid-cols-7">
              {d.week.map((day, i) => (
                <div
                  key={day.date}
                  className={`flex min-h-[130px] min-w-0 flex-col gap-1.5 border-b border-divider px-1 py-2.5 sm:px-1.5 ${i ? "border-l" : ""} ${day.today ? "bg-surface" : ""}`}
                >
                  <span className={`font-mono text-[10px] font-semibold tracking-[.1em] ${day.today ? "text-accent-700" : "opacity-60"}`}>{day.day}</span>
                  <span className="text-[22px] font-extrabold leading-none tracking-[-.03em] sm:text-[28px]">{day.date.slice(8)}</span>
                  {day.chips.map((c) => (
                    <Link key={c.href + c.label} href={c.href} className={`block px-0.5 py-1 text-[9px] font-extrabold leading-[1.2] no-underline [overflow-wrap:anywhere] sm:px-1 sm:text-[10px] ${CHIP[c.kind]}`}>
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHead title="Open volume" aside="by customer" />
            {d.volume.length === 0 && <p className="m-0 py-4 text-[14px] opacity-60">No open orders.</p>}
            {d.volume.map((v) => (
              <div key={v.name} className="flex flex-col gap-2 border-b border-divider py-3.5">
                <span className="flex justify-between gap-3 text-[14px]">
                  <b className="min-w-0 truncate">{v.name}</b>
                  <b className="text-[20px]">{formatQty(v.total)}</b>
                </span>
                <div className="flex h-3.5 gap-0.5">
                  {v.stock > 0 && <div className="bg-text" style={{ flex: v.stock }} />}
                  {v.open > 0 && <div className="bg-neutral-400" style={{ flex: v.open }} />}
                  {v.hold > 0 && <div className="bg-accent-800" style={{ flex: v.hold }} />}
                </div>
                <span className="text-[11px] opacity-65">
                  {[
                    `${formatQty(v.stock)} in stock`,
                    `${formatQty(v.open)} to make or in production`,
                    v.hold ? `${formatQty(v.hold)} on hold` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
