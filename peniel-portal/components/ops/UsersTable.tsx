import { setUserActive } from "@/app/ops/actions";
import { UserStatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type { UserStatus } from "@/lib/order-status";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export type UserRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: Role;
  active: boolean;
  last_login_at: string | null;
};

export function userStatus(u: UserRow): UserStatus {
  if (!u.active) return "deactivated";
  return u.last_login_at ? "active" : "invited";
}

// Laid out by the width of its own column (container query), not the screen:
// it sits full-width on Customers but in a half-width panel on Settings.
const COLS =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 @3xl:grid-cols-[minmax(0,0.9fr)_minmax(180px,1.5fr)_150px_130px_100px_110px]";

/** Users table (design 1o / 1s). Actions appear for admins only. */
export default function UsersTable({
  users,
  canManage,
  meId,
}: {
  users: UserRow[];
  canManage: boolean;
  meId: string;
}) {
  return (
    <div className="@container">
      <div className={`${COLS} th-row hidden border-b-2 border-divider py-2 @3xl:grid`}>
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Last login</span>
        <span>Status</span>
        <span>{canManage ? "Actions" : ""}</span>
      </div>
      {users.length === 0 && <p className="m-0 border-b border-divider py-2.5 text-[13px] opacity-60">No users yet.</p>}
      {users.map((u) => {
        const status = userStatus(u);
        return (
          <div key={u.user_id} className={`${COLS} items-center gap-y-1 border-b border-divider py-2.5 text-[13px]`}>
            <b className={status === "deactivated" ? "opacity-50" : undefined}>{u.full_name}</b>
            <span className="truncate @max-3xl:col-start-1 @max-3xl:row-start-2">{u.email}</span>
            <span className="@max-3xl:col-start-1 @max-3xl:row-start-3 @max-3xl:text-[12px] @max-3xl:opacity-70">
              {ROLE_LABELS[u.role]}
              <span className="@3xl:hidden"> · last login {u.last_login_at ? formatDateTime(u.last_login_at) : "never"}</span>
            </span>
            <span className="@max-3xl:hidden">{u.last_login_at ? formatDateTime(u.last_login_at) : "—"}</span>
            <span className="@max-3xl:col-start-2 @max-3xl:row-start-1 @max-3xl:text-right">
              <UserStatusBadge status={status} />
            </span>
            <span className="@max-3xl:col-start-2 @max-3xl:row-start-2 @max-3xl:text-right">
              {canManage && u.user_id !== meId && (
                <form action={setUserActive}>
                  <input type="hidden" name="user_id" value={u.user_id} />
                  <input type="hidden" name="active" value={String(!u.active)} />
                  <button
                    type="submit"
                    className={
                      "cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 " +
                      (u.active ? "text-accent-700" : "text-accent")
                    }
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              )}
              {u.user_id === meId && <span className="text-[12px] opacity-60">You</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
