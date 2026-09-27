import Image from "next/image";
import AutoPrint from "@/components/ui/AutoPrint";
import PrintButton from "@/components/ui/PrintButton";
import { formatDateTime } from "@/lib/format";

type Report = {
  heading: string;
  kpis: { label: string; value: string; sub?: string }[];
  sections: { title: string; lines: string[] }[];
  checks?: string[];
};

/**
 * A report laid out as a document for printing or saving as a PDF: Peniel
 * letterhead, the headline numbers, the checks, then each section. Internal:
 * staff only (the pages that use it check the role).
 */
export default function ReportDocument({
  report,
  title,
  period,
  back,
  autoPrint,
}: {
  report: Report;
  /** "End of day report" */
  title: string;
  /** "27 Sep 2026" */
  period: string;
  /** The report page in Ops. */
  back: string;
  autoPrint?: boolean;
}) {
  return (
    <main className="min-h-screen bg-neutral-200 px-4 py-6 print:bg-white print:p-0">
      <style>{"@page { size: A4; margin: 14mm 14mm 16mm; } @media print { html, body { background: #fff !important; } }"}</style>
      {autoPrint && <AutoPrint />}
      <div className="mx-auto mb-4 flex max-w-[860px] flex-wrap items-center justify-between gap-3 print:hidden">
        <a href={back} className="text-[14px]">
          ← Back to the report
        </a>
        <PrintButton />
      </div>
      <article className="mx-auto flex max-w-[860px] flex-col bg-white p-6 text-[13px] leading-[1.5] text-text shadow-sm sm:p-10 print:max-w-none print:p-0 print:text-[10.5px] print:shadow-none">
        {/* Letterhead */}
        <header className="flex items-center justify-between gap-4 border-b-2 border-text pb-3">
          <div className="flex items-center gap-2.5">
            <Image src="/img/logo-icon.png" alt="" width={40} height={40} className="size-10 print:size-9" />
            <div className="leading-[.95]">
              <div className="text-[18px] font-extrabold tracking-[-.01em] print:text-[16px]">PENIEL</div>
              <div className="text-[18px] font-extrabold tracking-[-.01em] text-accent print:text-[16px]">OPS</div>
            </div>
          </div>
          <div className="text-right font-mono text-[10px] uppercase leading-[1.6] tracking-[.12em] text-neutral-700 print:text-[8px]">
            Peniel Industry PLC
            <br />
            <b className="text-text">Bole Lemi Industrial Park · Addis Ababa</b>
            <br />
            Internal and confidential
          </div>
        </header>

        {/* Title */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-divider py-4 print:py-3">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-accent print:text-[8px]">Report</div>
            <h1 className="m-0 text-[28px] leading-[1.05] tracking-[-.02em] print:text-[22px]">{title}</h1>
            <div className="mt-1 text-[15px] font-semibold print:text-[12px]">{period}</div>
          </div>
          <div className="text-right text-[11px] text-neutral-700 print:text-[9px]">Prepared {formatDateTime(new Date())} (Addis Ababa)</div>
        </div>

        {/* Headline numbers */}
        <table className="my-4 w-full border-collapse break-inside-avoid print:my-3">
          <tbody>
            <tr>
              {report.kpis.map((k) => (
                <td key={k.label} className="w-1/4 border border-text px-3 py-2.5 align-top print:px-2 print:py-1.5">
                  <div className="font-mono text-[9px] uppercase tracking-[.1em] text-neutral-700 print:text-[7px]">{k.label}</div>
                  <div className="text-[24px] font-extrabold leading-tight tracking-[-.02em] print:text-[18px]">{k.value}</div>
                  {k.sub && <div className="text-[11px] text-neutral-700 print:text-[8.5px]">{k.sub}</div>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {report.checks && (
          <section className="mb-4 break-inside-avoid border-l-4 border-accent bg-accent-100 px-4 py-3 print:mb-3 print:px-3 print:py-2">
            <h2 className="m-0 mb-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-accent-800 print:text-[8px]">Check before closing the day</h2>
            {report.checks.length === 0 ? (
              <p className="m-0 font-semibold">Everything looks logged.</p>
            ) : (
              <ul className="m-0 list-disc pl-4 marker:text-accent-800">
                {report.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Sections */}
        <div className="flex flex-col gap-4 print:gap-3">
          {report.sections.map((s, i) => (
            <section key={s.title} className="break-inside-avoid">
              <h2 className="m-0 flex items-baseline gap-2 border-b-2 border-text pb-1 text-[15px] print:text-[12px]">
                <span className="font-mono text-[11px] text-accent print:text-[9px]">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              {s.lines.length > 0 && <p className="m-0 border-b border-divider py-1.5 font-semibold">{s.lines[0]}</p>}
              {s.lines.length > 1 && (
                <ul className="m-0 list-none p-0">
                  {s.lines.slice(1).map((l, j) => (
                    <li key={j} className="flex gap-2 border-b border-divider py-1 print:py-[3px]">
                      <span className="mt-[.55em] size-[5px] shrink-0 bg-accent print:mt-[.5em] print:size-[4px]" aria-hidden="true" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t-2 border-text pt-2 text-[10px] text-neutral-700 print:mt-4 print:text-[8px]">
          <span>
            <b className="text-text">Peniel Industry PLC</b> · Peniel Ops · {title}, {period}
          </span>
          <span>Internal: not for customers</span>
        </footer>
      </article>
    </main>
  );
}
