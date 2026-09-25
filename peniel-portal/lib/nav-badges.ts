import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { OPS_NAV, type OpsArea, type StaffRole } from "@/lib/roles";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Tab badges: what's new since the person last opened each tab (nav_seen),
// plus the few things that wait for an answer (a proof to approve, a pickup
// to confirm). Every count runs as the signed-in user, so customers only
// count through their own customer_* views and staff through RLS.

export type CustomerArea = "orders" | "production" | "artwork" | "documents" | "messages";
export const CUSTOMER_AREAS: CustomerArea[] = ["orders", "production", "artwork", "documents", "messages"];

/** Staff tabs counted by "new since last visit" (the others count work waiting: inbox, messages, quality, artwork). */
export const STAFF_SEEN_AREAS = ["orders", "production", "inventory", "documents", "settings"] as const;
export type StaffSeenArea = (typeof STAFF_SEEN_AREAS)[number];

/** When the person last opened each tab; a tab never opened counts from when their account was created. */
async function seenMap(supabase: Supabase, userId: string, since: string): Promise<{ get: (area: string) => string }> {
  const { data } = await supabase.from("nav_seen").select("area, seen_at").eq("user_id", userId).returns<{ area: string; seen_at: string }[]>();
  const m = new Map((data ?? []).map((r) => [r.area, r.seen_at]));
  return { get: (area) => m.get(area) ?? since };
}

/** When badges were counted (ms), so the nav knows which counts are newer. */
export const countedAt = (): number => Date.now();

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function customerBadges(supabase: Supabase, me: { user_id: string; created_at: string }): Promise<Record<CustomerArea, number>> {
  const seen = await seenMap(supabase, me.user_id, me.created_at);
  const head = { count: "exact" as const, head: true };

  const [timeline, output, batches, stock, proofsWaiting, reviewed, documents, messages] = await Promise.all([
    // Orders: status updates from Peniel (the customer's own submission doesn't count).
    supabase.from("customer_order_timeline").select("order_id").neq("status", "submitted").gt("created_at", seen.get("orders")).returns<{ order_id: string }[]>(),
    count(supabase.from("customer_daily_output").select("order_id", head).gt("published_at", seen.get("production"))),
    count(supabase.from("customer_quality_batches").select("id", head).gt("published_at", seen.get("production"))),
    count(supabase.from("customer_finished_stock").select("id", head).gt("updated_at", seen.get("production"))),
    // Artwork: proofs waiting for the customer's answer always count; artwork Peniel reviewed counts once.
    count(supabase.from("customer_proofs").select("id", head).eq("status", "sent")),
    count(supabase.from("customer_artwork_submissions").select("id", head).gt("reviewed_at", seen.get("artwork"))),
    count(supabase.from("customer_documents").select("id", head).gt("created_at", seen.get("documents"))),
    count(supabase.from("customer_messages").select("id", head).eq("from_peniel", true).eq("read_by_customer", false)),
  ]);

  return {
    orders: new Set((timeline.data ?? []).map((e) => e.order_id)).size,
    production: output + batches + stock,
    artwork: proofsWaiting + reviewed,
    documents,
    messages,
  };
}

export async function staffSeenBadges(
  supabase: Supabase,
  me: { user_id: string; role: StaffRole; created_at: string },
  visible: (area: OpsArea) => boolean,
): Promise<Partial<Record<StaffSeenArea, number>>> {
  const seen = await seenMap(supabase, me.user_id, me.created_at);
  const head = { count: "exact" as const, head: true };
  const zero = Promise.resolve(0);

  const [orders, production, pickups, stock, documents, failed] = await Promise.all([
    // Orders: status changes made by someone else.
    visible("orders")
      ? supabase
          .from("order_status_events")
          .select("order_id")
          .gt("created_at", seen.get("orders"))
          .or(`created_by.is.null,created_by.neq.${me.user_id}`)
          .returns<{ order_id: string }[]>()
          .then((r) => new Set((r.data ?? []).map((e) => e.order_id)).size)
      : zero,
    // Production: entries logged by someone else.
    visible("production")
      ? count(
          supabase
            .from("production_entries")
            .select("id", head)
            .gt("created_at", seen.get("production"))
            .or(`entered_by.is.null,entered_by.neq.${me.user_id}`),
        )
      : zero,
    // Inventory: pickup requests waiting for an answer always count, plus stock added since.
    visible("inventory") ? count(supabase.from("pickup_bookings").select("id", head).eq("status", "requested")) : zero,
    visible("inventory") ? count(supabase.from("finished_stock").select("id", head).gt("created_at", seen.get("inventory"))) : zero,
    // Documents: files added by someone else (customers included).
    visible("documents")
      ? count(
          supabase
            .from("documents")
            .select("id", head)
            .gt("created_at", seen.get("documents"))
            .or(`uploaded_by.is.null,uploaded_by.neq.${me.user_id}`),
        )
      : zero,
    // Settings (admin): notification emails that failed.
    visible("settings") ? count(supabase.from("notification_log").select("id", head).eq("status", "failed").gt("created_at", seen.get("settings"))) : zero,
  ]);

  return { orders, production, inventory: pickups + stock, documents, settings: failed };
}

/** Every staff badge: work waiting (inbox, messages, held batches, artwork) plus what's new since the last visit. */
export async function staffBadges(supabase: Supabase, me: { user_id: string; role: StaffRole; created_at: string }): Promise<Record<string, number>> {
  const visible = (area: OpsArea) => OPS_NAV.some((n) => n.area === area && n.roles.includes(me.role));
  const head = { count: "exact" as const, head: true };
  const [inbox, messages, held, artwork, seen] = await Promise.all([
    count(supabase.from("orders").select("id", head).eq("status", "submitted")),
    count(supabase.from("messages").select("id", head).eq("read_by_staff", false)),
    count(supabase.from("qc_inspections").select("id", head).eq("result", "on_hold")),
    count(supabase.from("artwork_submissions").select("id", head).eq("status", "submitted")),
    staffSeenBadges(supabase, me, visible),
  ]);
  return { inbox, messages, quality: held, artwork, ...seen };
}
