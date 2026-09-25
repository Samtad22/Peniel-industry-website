"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { CUSTOMER_AREAS, STAFF_SEEN_AREAS } from "@/lib/nav-badges";
import { isStaffRole, OPS_NAV } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

/** Record that the signed-in person opened a tab, so its "new" badge clears. */
export async function markTabSeen(area: string): Promise<void> {
  const me = await getProfile();
  if (!me) return;
  const staff = isStaffRole(me.role);
  const ok = staff
    ? (STAFF_SEEN_AREAS as readonly string[]).includes(area) && OPS_NAV.some((n) => n.area === area && n.roles.includes(me.role as never))
    : (CUSTOMER_AREAS as readonly string[]).includes(area);
  if (!ok) return;

  const supabase = await createClient();
  await supabase.from("nav_seen").upsert({ user_id: me.user_id, area, seen_at: new Date().toISOString() });
  revalidatePath(staff ? "/ops" : "/", "layout");
}
