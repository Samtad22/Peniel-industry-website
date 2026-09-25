import Link from "next/link";

/**
 * Empty, not-found and error screens inside a portal layout: a short
 * headline, one plain sentence, and the way back.
 */
export default function StatePanel({
  code,
  title,
  children,
  action,
}: {
  code?: string;
  title: string;
  children?: React.ReactNode;
  action?: { href: string; label: string } | React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center px-5 py-12 sm:px-10">
      <div className="flex max-w-[520px] flex-col gap-4 border-l-4 border-accent pl-5">
        {code && <span className="font-mono text-[12px] font-semibold tracking-[0.08em] text-accent-700">{code}</span>}
        <h2 className="m-0">{title}</h2>
        {children && <div className="text-[15px] opacity-80">{children}</div>}
        {action &&
          (typeof action === "object" && action !== null && "href" in action ? (
            <Link href={action.href} className="btn btn-primary btn-split w-fit min-w-[220px]">
              {action.label}
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            action
          ))}
      </div>
    </div>
  );
}
