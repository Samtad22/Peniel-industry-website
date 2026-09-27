import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";

/** A report's headline numbers and its sections, two columns on wide screens (prints in one). */
export default function ReportView({ report }: { report: { kpis: { label: string; value: string; sub?: string }[]; sections: { title: string; lines: string[] }[] } }) {
  return (
    <>
      <KpiStrip items={report.kpis} />
      <div className="grid gap-8 px-4 py-6 sm:px-8 lg:grid-cols-2 print:grid-cols-1">
        {report.sections.map((s) => (
          <section key={s.title} className="flex min-w-0 break-inside-avoid flex-col gap-3">
            <SectionHead title={s.title} />
            <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
              {s.lines.map((l, i) => (
                <li key={i} className={`border-b border-divider py-2 ${i === 0 ? "font-extrabold" : ""}`}>
                  {l}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
