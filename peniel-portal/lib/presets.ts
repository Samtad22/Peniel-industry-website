import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Active customer-facing phrases staff pick from, split by use. */
export async function loadPresets(supabase: Supabase) {
  const { data } = await supabase
    .from("hold_reason_presets")
    .select("id, text, kind")
    .eq("active", true)
    .order("sort_order")
    .returns<{ id: string; text: string; kind: "hold" | "reject" }[]>();
  const rows = data ?? [];
  return {
    hold: rows.filter((p) => p.kind === "hold").map(({ id, text }) => ({ id, text })),
    reject: rows.filter((p) => p.kind === "reject").map(({ id, text }) => ({ id, text })),
  };
}
