"use server";

import { getProfile } from "@/lib/auth";
import { CUSTOMER_AREAS, customerBadges, STAFF_SEEN_AREAS, staffBadges } from "@/lib/nav-badges";
import { isStaffRole, OPS_NAV, type StaffRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

/** The signed-in person's tab badges, fresh (the nav calls this as they move around). */
export async function loadTabBadges(): Promise<Record<string, number> | null> {
  const me = await getProfile();
  if (!me) return null;
  const supabase = await createClient();
  return isStaffRole(me.role)
    ? staffBadges(supabase, { ...me, role: me.role as StaffRole })
    : customerBadges(supabase, me);
}

/** Record that the person has looked at a tab's updates, so its "new" badge clears. */
export async function markTabSeen(area: string): Promise<void> {
  const me = await getProfile();
  if (!me) return;
  const ok = isStaffRole(me.role)
    ? (STAFF_SEEN_AREAS as readonly string[]).includes(area) && OPS_NAV.some((n) => n.area === area && n.roles.includes(me.role as StaffRole))
    : (CUSTOMER_AREAS as readonly string[]).includes(area);
  if (!ok) return;
  const supabase = await createClient();
  await supabase.from("nav_seen").upsert({ user_id: me.user_id, area, seen_at: new Date().toISOString() });
}
