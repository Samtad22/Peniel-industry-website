"use client";

/** A one-button form that asks before it runs (delete, cancel, undo). */
export default function ConfirmForm({
  action,
  fields,
  message,
  label,
  className = "cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2",
  title,
}: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  message: string;
  label: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="inline"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} title={title}>
        {label}
      </button>
    </form>
  );
}
