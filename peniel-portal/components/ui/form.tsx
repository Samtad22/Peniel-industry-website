import clsx from "clsx";

export function Field({
  label,
  htmlFor,
  hint,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  /** Right-hand side of the label row, e.g. a "Forgot password?" link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor} className={aside ? "!flex justify-between" : undefined}>
        {label}
        {aside}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs opacity-70">{hint}</p>}
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  /** Trailing icon; the label stays flush left (design rule). */
  icon?: React.ReactNode;
}) {
  return (
    <button {...props} className={clsx("btn", `btn-${variant}`, icon && "btn-split", className)}>
      {children}
      {icon && <span aria-hidden="true">{icon}</span>}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null | undefined }) {
  if (state?.error) {
    return (
      <p role="alert" className="m-0 bg-accent px-3.5 py-2.5 text-[13px] text-bg">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="m-0 bg-neutral-200 px-3.5 py-2.5 text-[13px] text-neutral-800">
        {state.ok}
      </p>
    );
  }
  return null;
}
