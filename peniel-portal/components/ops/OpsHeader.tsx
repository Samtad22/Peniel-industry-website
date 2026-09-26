import OpsCrumb from "./OpsCrumb";

/**
 * Every Peniel Ops screen opens with the v2 top bar (mono breadcrumb on the
 * left, the page's actions on the right) and a poster title set large.
 */
export default function OpsHeader({
  title,
  crumb,
  sub,
  actions,
}: {
  title: string;
  /** The item the page sits under and where it is, e.g. { label: "Orders", href: "/ops/orders", current: "PN-26-0001" }. */
  crumb?: { label: string; href: string; current?: string };
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <OpsTopBar current={crumb?.current}>{actions}</OpsTopBar>
      <div className="border-b-2 border-divider px-4 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
        <h1 className="m-0 break-words text-[36px] leading-[.95] tracking-[-.04em] sm:text-[56px] xl:text-[64px]">{title}</h1>
        {sub && <div className="mt-3 max-w-[900px] text-[14px] opacity-75 sm:text-[15px]">{sub}</div>}
      </div>
    </>
  );
}

/** Just the top bar: breadcrumb and actions (screens that set their own poster header). */
export function OpsTopBar({ current, children, dark }: { current?: string; children?: React.ReactNode; dark?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 px-4 py-3 sm:px-8 ${dark ? "border-neutral-800 bg-text text-bg [&_a]:text-bg" : "border-divider"}`}
    >
      <OpsCrumb current={current} />
      {children && <div className="ml-auto flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}
