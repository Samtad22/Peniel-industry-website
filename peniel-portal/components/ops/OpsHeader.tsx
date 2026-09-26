import Link from "next/link";

/** The page header bar used on every Peniel Ops screen. */
export default function OpsHeader({
  title,
  crumb,
  sub,
  actions,
}: {
  title: string;
  /** Breadcrumb above the title, e.g. { label: "Orders", href: "/ops/orders" } → "ORDERS / PN-26-0001". */
  crumb?: { label: string; href: string; current?: string };
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-divider px-4 py-5 sm:px-8">
      {/* Title takes the row; on a phone the actions wrap underneath instead of squeezing it. */}
      <div className="min-w-0 flex-[1_1_260px]">
        {crumb && (
          <h6 className="m-0 text-accent-700">
            <Link href={crumb.href} className="text-inherit no-underline">
              {crumb.label}
            </Link>
            {crumb.current && ` / ${crumb.current}`}
          </h6>
        )}
        <h2 className={`break-words max-sm:text-[26px] ${crumb ? "mb-0 mt-1" : "m-0"}`}>{title}</h2>
        {sub && <div className="text-[13px] opacity-70">{sub}</div>}
      </div>
      {actions}
    </div>
  );
}
