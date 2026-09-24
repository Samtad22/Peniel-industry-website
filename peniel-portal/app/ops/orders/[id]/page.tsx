import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StaffOrderView from "@/components/ops/StaffOrderView";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { loadPresets } from "@/lib/presets";
import { opsRolesFor } from "@/lib/roles";
import { loadStaffOrder } from "@/lib/staff-orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Order" };

export default async function StaffOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff(opsRolesFor("orders"));
  const { id } = await params;
  const supabase = await createClient();
  const [o, presets] = await Promise.all([loadStaffOrder(supabase, id), loadPresets(supabase)]);
  if (!o) notFound();

  const canEdit = me.role === "admin" || me.role === "sales";
  // Opening the order counts as reading the customer's messages on it.
  if (canEdit && o.messages.some((m) => m.from_customer)) {
    const { data: threads } = await supabase.from("message_threads").select("id").eq("order_id", id);
    const ids = (threads ?? []).map((t: { id: string }) => t.id);
    if (ids.length) await supabase.from("messages").update({ read_by_staff: true }).in("thread_id", ids).eq("read_by_staff", false);
  }

  return (
    <StaffOrderView
      o={o}
      canEdit={canEdit}
      holdPresets={presets.hold}
      rejectPresets={presets.reject}
      minDate={addisDateISO(new Date())}
    />
  );
}
