import clsx from "clsx";

export default function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={clsx("contents")}>
      <button
        type="submit"
        className={clsx("cursor-pointer border-0 bg-transparent p-0 font-[inherit] underline-offset-2 hover:underline", className)}
      >
        Sign out
      </button>
    </form>
  );
}
