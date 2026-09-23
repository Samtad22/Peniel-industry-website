import clsx from "clsx";

export default function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={clsx("text-sm font-medium hover:underline", className)}>
        Sign out
      </button>
    </form>
  );
}
