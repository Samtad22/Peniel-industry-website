import type { Metadata } from "next";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import ProofCard, { type CustomerProof } from "@/components/customer/ProofCard";
import Crown from "@/components/ui/Crown";
import { Pill } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format";
import { proofPill } from "@/lib/proofs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Artwork" };

type Proof = CustomerProof & { brand_id: string; customer_comment: string | null; responded_by_name: string | null; responded_at: string | null };

/** Your artwork: proofs to approve, approved artwork per brand, proof history (design 1q). */
export default async function ArtworkPage() {
  const supabase = await createClient();
  const [{ data: brands }, { data: artwork }, { data: proofs }] = await Promise.all([
    supabase.from("customer_brands").select("id, name, colours").eq("active", true).order("name").returns<{ id: string; name: string; colours: string[] }[]>(),
    supabase
      .from("customer_artwork")
      .select("id, brand_id, version, approved_at, is_current")
      .returns<{ id: string; brand_id: string; version: number; approved_at: string | null; is_current: boolean }[]>(),
    supabase
      .from("customer_proofs")
      .select("id, brand_id, brand_name, version, order_no, status, note, approve_by, created_at, file_name, mime_type, customer_comment, responded_by_name, responded_at")
      .order("created_at", { ascending: false })
      .returns<Proof[]>(),
  ]);

  const waiting = (proofs ?? []).filter((p) => p.status === "sent");

  return (
    <>
      <CustomerPageHead section="Artwork" title="Your artwork" />
      {waiting.length > 0 && (
        <div className="flex flex-col gap-4 border-b-2 border-divider px-4 py-6 sm:px-10">
          <h4 className="m-0">Waiting for your approval</h4>
          <div className="grid gap-4 xl:grid-cols-2">
            {waiting.map((p) => (
              <ProofCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden border-b-2 border-divider">
        <div className="-ml-0.5 grid sm:grid-cols-2 xl:grid-cols-3">
          {(brands ?? []).map((b) => {
            const current = (artwork ?? []).find((a) => a.brand_id === b.id && a.is_current);
            const latest = (proofs ?? []).find((p) => p.brand_id === b.id);
            return (
              <div key={b.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-l-2 border-divider px-4 py-5 sm:px-10">
                <div className="grid size-24 place-items-center bg-surface">
                  <Crown colours={b.colours} size={72} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
                  <b className="text-[16px]">{b.name}</b>
                  <span className="opacity-70">
                    {current ? `Approved artwork v${current.version} · ${formatDate(current.approved_at)}` : "No approved artwork on file yet"}
                  </span>
                  {latest && (
                    <span>
                      <Pill style={proofPill(latest.status, "customer").style}>{proofPill(latest.status, "customer").label}</Pill>
                    </span>
                  )}
                  {current && (
                    <a href={`/files/artwork/${current.id}`} className="text-[13px]">
                      Download approved artwork ↓
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-10 pt-6 sm:px-10">
        <h4 className="mb-2.5 mt-0">Proof history</h4>
        {(proofs ?? []).length === 0 ? (
          <p className="m-0 text-[14px] opacity-70">No proofs yet. When Peniel sends artwork for you to check, it appears here.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="th-row grid grid-cols-[70px_minmax(0,1fr)_110px_120px_200px_minmax(0,1fr)_32px] gap-3 border-b-2 border-divider py-2">
                <span>Proof</span>
                <span>Brand</span>
                <span>Order</span>
                <span>Sent</span>
                <span>Status</span>
                <span>Decided by</span>
                <span />
              </div>
              {(proofs ?? []).map((p) => {
                const pill = proofPill(p.status, "customer");
                return (
                  <div key={p.id} className="grid grid-cols-[70px_minmax(0,1fr)_110px_120px_200px_minmax(0,1fr)_32px] items-center gap-3 border-b border-divider py-2.5 text-[14px]">
                    <b>v{p.version ?? "?"}</b>
                    <span>{p.brand_name}</span>
                    <span>{p.order_no ?? "—"}</span>
                    <span>{formatDate(p.created_at)}</span>
                    <span>
                      <Pill style={pill.style}>{pill.label}</Pill>
                    </span>
                    <span className="text-[13px]">
                      {p.responded_by_name ?? "—"}
                      {p.customer_comment && <span className="block text-[12px] opacity-70">“{p.customer_comment}”</span>}
                    </span>
                    <a href={`/files/proofs/${p.id}`} className="text-center font-extrabold no-underline" aria-label={`Download proof v${p.version ?? ""}`}>
                      ↓
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
