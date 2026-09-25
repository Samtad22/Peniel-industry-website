"use client";

import { useActionState } from "react";
import { respondToProof, type ProofState } from "@/app/(customer)/artwork/actions";
import { Pill } from "@/components/ui/StatusBadge";
import { Button, FormMessage } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { deliveryLine, proofPill, trackingUrl, type PhysicalDelivery, type ProofStatus } from "@/lib/proofs";

export type CustomerProof = {
  id: string;
  version: number | null;
  brand_name: string;
  order_no: string | null;
  status: ProofStatus;
  note: string | null;
  approve_by: string | null;
  created_at: string;
  file_name: string | null;
  mime_type: string | null;
  /** Physical sample: courier (with tracking) or delivered by Peniel. Never driver details. */
  physical_delivery?: PhysicalDelivery | null;
  courier?: string | null;
  tracking_number?: string | null;
};

/** "Physical proof by DHL · tracking …" with a link to DHL tracking. */
export function ProofDelivery({ p }: { p: Pick<CustomerProof, "physical_delivery" | "courier" | "tracking_number"> }) {
  const line = deliveryLine({ physical_delivery: p.physical_delivery ?? null, courier: p.courier ?? null, tracking_number: p.tracking_number ?? null });
  if (!line) return null;
  const url = trackingUrl(p.courier ?? null, p.tracking_number ?? null);
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-2.5 py-2 text-[13px]">
      <span>📦 {line}</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold">
          Track on DHL ↗
        </a>
      )}
    </div>
  );
}

/** An artwork proof to approve or send back (customer design 1c). */
export default function ProofCard({ p, preview = false }: { p: CustomerProof; preview?: boolean }) {
  const [state, action, pending] = useActionState<ProofState, FormData>(respondToProof, null);
  const src = `/files/proofs/${p.id}?inline=1`;
  const isImage = p.mime_type?.startsWith("image/");
  const pill = proofPill(p.status, "customer");

  return (
    <div className="flex flex-col gap-3.5 border-2 border-accent p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-[15px]">
          Artwork proof {p.version ? `v${p.version}` : ""} · {p.brand_name}
          {p.order_no && ` · ${p.order_no}`}
        </b>
        <span className="text-[12px] opacity-70">Sent {formatDate(p.created_at)} by Peniel</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
        {!p.file_name ? (
          <div className="grid aspect-square place-items-center bg-surface p-4 text-center text-[13px]">
            <span className="flex flex-col items-center gap-1">
              <span className="text-[28px]" aria-hidden="true">📦</span>
              <b>Physical sample</b>
              <span className="text-[12px] opacity-70">Check the printed crowns Peniel sent you, then answer here.</span>
            </span>
          </div>
        ) : (
        <a href={src} target="_blank" rel="noreferrer" className="grid aspect-square place-items-center overflow-hidden bg-surface text-[13px] text-text no-underline">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Proof ${p.file_name ?? ""}`} loading="lazy" className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 p-4 text-center">
              <span className="font-mono text-[11px] font-semibold opacity-60">PDF</span>
              <b>Open proof ↗</b>
              <span className="text-[12px] opacity-60">{p.file_name}</span>
            </span>
          )}
        </a>
        )}
        <div className="flex flex-col gap-2 text-[14px]">
          <span>
            <Pill style={pill.style}>{pill.label}</Pill>
          </span>
          <ProofDelivery p={p} />
          {p.note && (
            <div className="border-t border-divider pt-2">
              <div className="text-[11px] uppercase tracking-[0.08em] opacity-60">Note from Peniel</div>
              <div className="whitespace-pre-line">{p.note}</div>
            </div>
          )}
          {p.approve_by && p.status === "sent" && (
            <div className="bg-accent-100 px-2.5 py-2 text-[13px] text-accent-800">Please answer by {formatDate(p.approve_by)} to keep your due date.</div>
          )}
          {p.file_name && (
            <a href={`/files/proofs/${p.id}`} className="text-[13px]">
              Download proof ↓
            </a>
          )}
        </div>
      </div>
      {preview && p.status === "sent" && (
        <p className="m-0 bg-neutral-200 px-3.5 py-3 text-[13px]">The customer approves or requests changes here.</p>
      )}
      {!preview && p.status === "sent" && !state?.ok && (
        <form action={action} className="flex flex-col gap-2.5">
          <input type="hidden" name="proof_id" value={p.id} />
          <div className="field">
            <label htmlFor={`c-${p.id}`}>Comment (required if you request changes)</label>
            <textarea id={`c-${p.id}`} name="comment" maxLength={2000} placeholder="e.g. Move the logo 1 mm up" className="input !min-h-[70px]" />
          </div>
          <FormMessage state={state} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit" name="decision" value="approve" disabled={pending} icon="✓" className="min-h-11">
              Approve proof
            </Button>
            <Button type="submit" name="decision" value="changes" variant="secondary" disabled={pending} icon="↺" className="min-h-11">
              Request changes
            </Button>
          </div>
        </form>
      )}
      {state?.ok && <FormMessage state={state} />}
    </div>
  );
}
