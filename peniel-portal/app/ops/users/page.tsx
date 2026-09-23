import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/form";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { opsRolesFor, ROLE_LABELS, type Role } from "@/lib/roles";
import { setUserActive } from "./actions";
import InviteForm from "./InviteForm";

export const metadata = { title: "Users" };

type ProfileRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  companies: { name: string } | null;
};

export default async function UsersPage() {
  const me = await requireStaff(opsRolesFor("/ops/users"));
  const supabase = await createClient();

  const [{ data: people }, { data: companies }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, role, active, last_login_at, companies(name)")
      .order("created_at", { ascending: false })
      .returns<ProfileRow[]>(),
    supabase.from("companies").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="There is no public sign-up. Invite each person here; they receive an email to choose a password."
      />
      <InviteForm companies={companies ?? []} />

      <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-navy-tint/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(people ?? []).map((p) => (
              <tr key={p.user_id} className={p.active ? undefined : "text-muted"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{p.full_name}</p>
                  <p className="text-xs text-muted">{p.email}</p>
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[p.role]}</td>
                <td className="px-4 py-3">{p.companies?.name ?? "Peniel staff"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.last_login_at ? formatDateTime(p.last_login_at) : "Invited — not signed in yet"}
                </td>
                <td className="px-4 py-3">
                  {p.user_id === me.user_id ? (
                    <span className="text-xs text-muted">You</span>
                  ) : (
                    <form action={setUserActive}>
                      <input type="hidden" name="user_id" value={p.user_id} />
                      <input type="hidden" name="active" value={String(!p.active)} />
                      <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                        {p.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
