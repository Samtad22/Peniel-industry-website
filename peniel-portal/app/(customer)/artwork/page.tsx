import type { Metadata } from "next";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import ProofCard, { ProofDelivery, type CustomerProof } from "@/components/customer/ProofCard";
import SendArtworkDialog from "@/components/customer/SendArtworkDialog";
import Crown, { crownSrc } from "@/components/ui/Crown";
import { Pill } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format";
import { requireCustomer } from "@/lib/auth";
import { fileExt } from "@/lib/files";
import { proofPill, submissionPill, type SubmissionStatus } from "@/lib/proofs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Artwork" };

type Proof = CustomerProof & { brand_id: string; customer_comment: string | null; responded_by_name: string | null; responded_at: string | null };
type Submission = {
  id: string;
  brand_name: string | null;
  order_no: string | null;
  title: string;
  note: string | null;
  file_name: string;
  status: SubmissionStatus;
  staff_comment: string | null;
  created_at: string;
  submitted_by_name: string | null;
};

/**
 * Your artwork (design 1q), both ways: proofs from Peniel to approve, and
 * artwork you send Peniel to review; approved artwork per brand; history.
 */
export default async function ArtworkPage() {
  const me = await requireCustomer();
  const supabase = await createClient();
  const [{ data: brands }, { data: artwork }, { data: proofs }, { data: submissions }, { data: orders }] = await Promise.all([
    supabase
      .from("customer_brands")
      .select("id, name, colours, crown_image_path")
      .eq("active", true)
      .order("name")
      .returns<{ id: string; name: string; colours: string[]; crown_image_path: string | null }[]>(),
    supabase
      .from("customer_artwork")
      .select("id, brand_id, version, approved_at, is_current")
      .returns<{ id: string; brand_id: string; version: number; approved_at: string | null; is_current: boolean }[]>(),
    supabase
      .from("customer_proofs")
      .select(
        "id, brand_id, brand_name, version, order_no, status, note, approve_by, created_at, file_name, mime_type, customer_comment, responded_by_name, responded_at, physical_delivery, courier, tracking_number",
      )
      .order("created_at", { ascending: false })
      .returns<Proof[]>(),
    supabase
      .from("customer_artwork_submissions")
      .select("id, brand_name, order_no, title, note, file_name, status, staff_comment, created_at, submitted_by_name")
      .order("created_at", { ascending: false })
      .returns<Submission[]>(),
    supabase
      .from("customer_orders")
      .select("id, order_no, brand_id, brand_name, status")
      .not("status", "in", "(rejected,delivered)")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<{ id: string; order_no: string; brand_id: string; brand_name: string }[]>(),
  ]);

  const waiting = (proofs ?? []).filter((p) => p.status === "sent");

  return (
    <>
      <CustomerPageHead
        section="Artwork"
        title="Your artwork"
        aside={
          <SendArtworkDialog
            companyId={me.company_id}
            brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
            orders={(orders ?? []).map((o) => ({ id: o.id, brand_id: o.brand_id, label: `${o.order_no} · ${o.brand_name}` }))}
          />
        }
      />
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
                  <Crown colours={b.colours} src={crownSrc(b)} size={84} alt={`${b.name} crown`} />
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

      <div className="border-b-2 border-divider px-4 py-6 sm:px-10">
        <h4 className="mb-2.5 mt-0">Artwork you sent to Peniel</h4>
        {(submissions ?? []).length === 0 ? (
          <p className="m-0 text-[14px] opacity-70">
            Nothing yet. Use <b>Send artwork to Peniel</b> for a new label, a change, or a reference file.
          </p>
        ) : (
          <div className="border-t-2 border-divider">
            {(submissions ?? []).map((sub) => {
              const pill = submissionPill(sub.status, "customer");
              return (
                <div key={sub.id} className="grid gap-2 border-b border-divider py-3 text-[14px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <b>{sub.title}</b>
                      <Pill style={pill.style}>{pill.label}</Pill>
                    </span>
                    <span className="text-[12px] opacity-70">
                      {[sub.brand_name ?? "No brand", sub.order_no, `sent ${formatDate(sub.created_at)}`, sub.submitted_by_name].filter(Boolean).join(" · ")}
                    </span>
                    <a href={`/files/submissions/${sub.id}`} className="flex items-center gap-2 text-[13px]">
                      <span className="bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text">{fileExt(sub.file_name)}</span>
                      {sub.file_name} ↓
                    </a>
                  </div>
                  <div className="text-[13px]">
                    {sub.staff_comment ? (
                      <div className={sub.status === "changes_requested" ? "bg-accent-100 px-3 py-2 text-accent-800" : "bg-surface px-3 py-2"}>
                        <div className="text-[11px] uppercase tracking-[0.08em] opacity-70">Peniel replied</div>
                        <div className="whitespace-pre-line">{sub.staff_comment}</div>
                      </div>
                    ) : (
                      sub.note && <span className="opacity-70">Your note: “{sub.note}”</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                    <span className="flex flex-col gap-1 text-[13px]">
                      <span>
                        {p.responded_by_name ?? "—"}
                        {p.customer_comment && <span className="block text-[12px] opacity-70">“{p.customer_comment}”</span>}
                      </span>
                      <ProofDelivery p={p} />
                    </span>
                    {p.file_name ? (
                      <a href={`/files/proofs/${p.id}`} className="text-center font-extrabold no-underline" aria-label={`Download proof v${p.version ?? ""}`}>
                        ↓
                      </a>
                    ) : (
                      <span className="text-center" title="Physical sample" aria-label="Physical sample">
                        📦
                      </span>
                    )}
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
