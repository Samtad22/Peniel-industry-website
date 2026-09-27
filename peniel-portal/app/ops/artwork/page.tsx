import type { Metadata } from "next";
import Link from "next/link";
import { lockArtwork, lockSubmission } from "@/app/ops/artwork/actions";
import { DeleteLibraryFile, LibraryUploadDialog } from "@/components/ops/ArtworkLibrary";
import { DispatchDialog, ReviewSubmissionForm, NO_DELIVERY } from "@/components/ops/ArtworkForms";
import OpsHeader from "@/components/ops/OpsHeader";
import { InternalPanel, SectionHead } from "@/components/ops/OpsKit";
import SendProofPanel from "@/components/ops/SendProofPanel";
import Crown, { crownSrc } from "@/components/ui/Crown";
import { Pill } from "@/components/ui/StatusBadge";
import { LIBRARY_LABELS, type LibraryFile, type LibraryKind } from "@/lib/artwork-library";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth } from "@/lib/format";
import { OPEN_STATUSES } from "@/lib/order-status";
import { fileExt, formatBytes } from "@/lib/files";
import { proofPill, submissionPill, trackingUrl, type PhysicalDelivery, type ProofStatus, type SubmissionStatus } from "@/lib/proofs";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Artwork" };

type Brand = {
  id: string;
  name: string;
  company_id: string;
  size: string;
  finish: string | null;
  liner: string;
  colours: string[];
  crown_image_path: string | null;
  current: { id: string; version: number; approved_at: string | null } | null;
};

type Proof = {
  id: string;
  brand_id: string;
  version: number | null;
  status: ProofStatus;
  customer_comment: string | null;
  created_at: string;
  responded_at: string | null;
  order_id: string | null;
  file_path: string | null;
  physical_delivery: PhysicalDelivery | null;
  courier: string | null;
  tracking_number: string | null;
  dispatched_at: string | null;
  delivery_driver: string | null;
  delivery_vehicle: string | null;
  brands: { name: string; company_id: string; companies: { name: string } | null } | null;
  orders: { order_no: string } | null;
  responder: { full_name: string } | null;
};

type Submission = {
  id: string;
  company_id: string;
  brand_id: string | null;
  order_id: string | null;
  title: string;
  note: string | null;
  file_name: string;
  status: SubmissionStatus;
  staff_comment: string | null;
  created_at: string;
  artwork_version_id: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
  orders: { order_no: string } | null;
  submitter: { full_name: string } | null;
};

/** Staff artwork: approved versions per brand, the artwork files library, artwork from customers, the proof queue, sending proofs (design 1m). */
export default async function ArtworkPage({ searchParams }: { searchParams: Promise<{ c?: string; f?: string }> }) {
  const me = await requireStaff(opsRolesFor("artwork"));
  const sp = await searchParams;
  const canEdit = me.role === "admin" || me.role === "sales";
  const supabase = await createClient();

  const [{ data: companies }, { data: brands }, { data: proofs }, { data: orders }, { data: submissions }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("active", true).order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("brands")
      .select("id, name, company_id, size, finish, liner, colours, crown_image_path, current:artwork_versions!brands_current_artwork_fk(id, version, approved_at)")
      .eq("active", true)
      .order("name")
      .returns<Brand[]>(),
    supabase
      .from("proofs")
      .select(
        "id, brand_id, version, status, customer_comment, created_at, responded_at, order_id, file_path, physical_delivery, courier, tracking_number, dispatched_at, delivery_driver, delivery_vehicle, brands(name, company_id, companies(name)), orders(order_no), responder:profiles!proofs_responded_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<Proof[]>(),
    supabase
      .from("orders")
      .select("id, company_id, brand_id, order_no, status, brands(name)")
      .in("status", OPEN_STATUSES)
      .order("order_no", { ascending: false })
      .returns<{ id: string; company_id: string; brand_id: string; order_no: string; status: string; brands: { name: string } | null }[]>(),
    supabase
      .from("artwork_submissions")
      .select(
        "id, company_id, brand_id, order_id, title, note, file_name, status, staff_comment, created_at, artwork_version_id, companies(name), brands(name), orders(order_no), submitter:profiles!artwork_submissions_submitted_by_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Submission[]>(),
  ]);

  // Default: the customer whose artwork is waiting for review, else the one
  // with the latest proof, else the first with brands.
  const companyId =
    (companies ?? []).find((c) => c.id === sp.c)?.id ??
    (submissions ?? []).find((x) => x.status === "submitted")?.company_id ??
    (proofs ?? [])[0]?.brands?.company_id ??
    (brands ?? [])[0]?.company_id ??
    (companies ?? [])[0]?.id ??
    "";
  const mine = (brands ?? []).filter((b) => b.company_id === companyId);
  // The artwork library of this customer's brands. RLS hides print layouts from everyone but admin.
  const isAdmin = me.role === "admin";
  const { data: libraryData } = mine.length
    ? await supabase
        .from("brand_artwork_files")
        .select("id, brand_id, kind, title, file_name, size_bytes, ups, notes, created_at")
        .in("brand_id", mine.map((b) => b.id))
        .order("created_at", { ascending: false })
        .returns<LibraryFile[]>()
    : { data: [] as LibraryFile[] };
  const library = libraryData ?? [];
  const brandPicks = mine.map((b) => ({ id: b.id, name: b.name }));
  const libraryList = (kind: LibraryKind, canAdd: boolean) => (
    <div className="flex flex-col">
      {mine.map((b) => {
        const files = library.filter((x) => x.brand_id === b.id && x.kind === kind);
        return (
          <div key={b.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-divider py-2.5 text-[13px] max-sm:grid-cols-1 max-sm:gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <b className="text-[14px]">{b.name}</b>
              {canAdd && <LibraryUploadDialog kind={kind} companyId={companyId} brands={brandPicks} brandId={b.id} />}
            </span>
            {files.length === 0 ? (
              <span className="opacity-50">No files yet</span>
            ) : (
              <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
                {files.map((f) => (
                  <li key={f.id} className="flex min-w-0 items-start gap-2">
                    <span className="mt-px shrink-0 bg-surface px-1.5 py-0.5 font-mono text-[10px]">{fileExt(f.file_name)}</span>
                    <span className="min-w-0 flex-1">
                      <a href={`/files/library/${f.id}`} className="block truncate font-semibold">
                        {f.title ?? f.file_name} ↓
                      </a>
                      <span className="opacity-60">
                        {[f.size_bytes ? formatBytes(f.size_bytes) : null, f.ups ? `${f.ups} up` : null, formatDate(f.created_at)].filter(Boolean).join(" · ")}
                        {f.notes ? ` · ${f.notes}` : ""}
                      </span>
                    </span>
                    {isAdmin && <DeleteLibraryFile id={f.id} name={f.title ?? f.file_name} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
  const allProofs = proofs ?? [];
  const f = sp.f === "waiting" || sp.f === "changes" ? sp.f : "all";
  const queue = allProofs.filter((p) => (f === "waiting" ? p.status === "sent" : f === "changes" ? p.status === "changes_requested" : true));
  // Approved proofs newer than the brand's locked artwork can be locked.
  const lockable = allProofs.filter((p) => {
    if (p.status !== "approved" || !p.file_path || p.brands?.company_id !== companyId) return false;
    const b = mine.find((x) => x.id === p.brand_id);
    return !b?.current?.approved_at || (p.responded_at ?? "") > b.current.approved_at;
  });
  const latestPerBrand = (brandId: string) => allProofs.find((p) => p.brand_id === brandId);
  const COLS = "grid grid-cols-[44px_minmax(0,1fr)_96px_60px_minmax(0,1.3fr)_170px] items-center gap-2.5";
  // New customer artwork first, then the latest answered ones.
  const toReview = (submissions ?? []).filter((x) => x.status === "submitted").length;
  const sentOut = allProofs.filter((p) => p.status === "sent").length;
  const fromCustomers = [...(submissions ?? [])].sort((a, b) => Number(b.status === "submitted") - Number(a.status === "submitted")).slice(0, 12);

  return (
    <>
      <OpsHeader
        title="Artwork"
        sub={`${toReview} from customers to review · ${sentOut} ${sentOut === 1 ? "proof" : "proofs"} with customers · ${allProofs.filter((p) => p.status === "changes_requested").length} changes requested`}
        actions={
          <form className="flex items-end gap-2">
            <label htmlFor="aw-c" className="sr-only">
              Customer
            </label>
            <select id="aw-c" name="c" defaultValue={companyId} className="input w-[240px]">
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary text-text">
              Show
            </button>
          </form>
        }
      />

      <div className="overflow-hidden border-b-2 border-divider">
        <div className="-ml-0.5 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          {mine.length === 0 && <p className="m-0 px-8 py-5 text-[14px] opacity-70">This customer has no brands yet.</p>}
          {mine.map((b) => {
            const latest = latestPerBrand(b.id);
            return (
              <div key={b.id} className="flex flex-col gap-1.5 border-l-2 border-divider px-4 py-4 text-[13px] sm:px-6">
                <Crown colours={b.colours} src={crownSrc(b)} size={44} alt="" />
                <b className="text-[15px]">{b.name}</b>
                <span className="opacity-70">{[b.size, b.finish, b.liner].filter(Boolean).join(" · ")}</span>
                <span className={b.current ? "font-extrabold" : "opacity-60"}>
                  {b.current ? (
                    <a href={`/files/artwork/${b.current.id}`} className="text-text">
                      🔒︎ v{b.current.version} · approved {formatDate(b.current.approved_at)}
                    </a>
                  ) : (
                    "No locked artwork"
                  )}
                </span>
                {latest && (
                  <span>
                    <Pill style={proofPill(latest.status, "staff").style}>
                      Proof v{latest.version ?? "?"} · {proofPill(latest.status, "staff").label}
                    </Pill>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {mine.length > 0 && (
        <section className="border-b-2 border-divider px-4 py-6 sm:px-8" aria-label="Artwork files">
          <SectionHead title="Artwork files" aside={`${library.length} ${library.length === 1 ? "file" : "files"} on record`} />
          <div className={`grid gap-6 pt-4 ${isAdmin ? "lg:grid-cols-2" : ""}`}>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b className="text-[16px]">{LIBRARY_LABELS.design.title}</b>
                  <span className="block text-[12px] opacity-70">{LIBRARY_LABELS.design.sub}</span>
                </span>
                {canEdit && <LibraryUploadDialog kind="design" companyId={companyId} brands={brandPicks} />}
              </div>
              {libraryList("design", canEdit)}
            </div>
            {isAdmin && (
              <InternalPanel label="ADMIN ONLY · PRINT LAYOUTS FOR THE CTP MACHINE" className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b className="text-[16px]">{LIBRARY_LABELS.print_layout.title}</b>
                    <span className="block text-[12px] opacity-70">{LIBRARY_LABELS.print_layout.sub}</span>
                  </span>
                  <LibraryUploadDialog kind="print_layout" companyId={companyId} brands={brandPicks} />
                </div>
                {libraryList("print_layout", true)}
              </InternalPanel>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
          <div className="mb-8">
            <SectionHead title="Artwork from customers" aside={toReview ? `${toReview} to review` : "nothing waiting"} />
            {fromCustomers.length === 0 ? (
              <p className="m-0 py-3 text-[13px] opacity-60">
                Nothing yet. Customers can send artwork from their Artwork page; it appears here for review.
              </p>
            ) : (
              <div>
                {fromCustomers.map((sub) => {
                  const pill = submissionPill(sub.status, "staff");
                  return (
                    <div
                      key={sub.id}
                      className={`grid gap-3 border-b border-divider py-3 text-[13px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${sub.status === "submitted" ? "bg-accent-100 px-3 shadow-[inset_5px_0_0_var(--color-accent)]" : ""}`}
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Pill style={pill.style}>{pill.label}</Pill>
                          <b className="text-[14px]">{sub.title}</b>
                        </span>
                        <span className="opacity-70">
                          {[sub.companies?.name, sub.brands?.name ?? "No brand chosen", sub.orders?.order_no].filter(Boolean).join(" · ")} · {formatDayMonth(sub.created_at)}
                          {sub.submitter && ` · ${sub.submitter.full_name}`}
                        </span>
                        <a href={`/files/submissions/${sub.id}`} className="flex items-center gap-2 font-semibold">
                          <span className="bg-surface px-1.5 py-0.5 font-mono text-[10px]">{fileExt(sub.file_name)}</span>
                          {sub.file_name} ↓
                        </a>
                        {sub.note && <span className="whitespace-pre-line">“{sub.note}”</span>}
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
                        {sub.status === "submitted" && canEdit ? (
                          <ReviewSubmissionForm submissionId={sub.id} />
                        ) : (
                          sub.staff_comment && <span className="text-[12px] opacity-80">Your reply: “{sub.staff_comment}”</span>
                        )}
                        {canEdit && sub.status === "accepted" && sub.brand_id && !sub.artwork_version_id && (
                          <form action={lockSubmission}>
                            <input type="hidden" name="submission_id" value={sub.id} />
                            <button type="submit" className="btn btn-secondary btn-split w-full text-text">
                              Lock as the approved {sub.brands?.name} artwork<span aria-hidden="true">🔒︎</span>
                            </button>
                          </form>
                        )}
                        {sub.artwork_version_id && <span className="text-[12px] font-extrabold">🔒︎ Locked as approved artwork</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SectionHead title="Proof queue" aside="all customers">
            <div className="flex border border-divider text-[12px]">
              {(
                [
                  ["all", "All"],
                  ["waiting", "Awaiting customer"],
                  ["changes", "Changes requested"],
                ] as const
              ).map(([k, v]) => (
                <Link
                  key={k}
                  href={`/ops/artwork?c=${companyId}${k === "all" ? "" : `&f=${k}`}`}
                  className={`px-2.5 py-[5px] no-underline ${f === k ? "bg-text !text-bg" : "text-text hover:bg-text/[.07]"}`}
                >
                  {v}
                </Link>
              ))}
            </div>
          </SectionHead>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${COLS} th-row border-b border-divider py-2`}>
                <span>Proof</span>
                <span>Brand · customer</span>
                <span>Order</span>
                <span>Sent</span>
                <span>Status · customer comment</span>
                <span>Delivery</span>
              </div>
              {queue.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No proofs here.</p>}
              {queue.map((p) => {
                const pill = proofPill(p.status, "staff");
                return (
                  <div key={p.id} className={`${COLS} border-b border-divider py-2.5 text-[13px]`}>
                    {p.file_path ? (
                      <a href={`/files/proofs/${p.id}`} className="font-extrabold">
                        v{p.version ?? "?"}
                      </a>
                    ) : (
                      <b title="Physical sample only">v{p.version ?? "?"}</b>
                    )}
                    <span className="truncate">
                      {p.brands?.name} · {p.brands?.companies?.name}
                    </span>
                    <span>
                      {p.order_id ? (
                        <Link href={`/ops/orders/${p.order_id}`} className="text-text">
                          {p.orders?.order_no}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </span>
                    <span>{formatDayMonth(p.created_at)}</span>
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <Pill style={pill.style}>{pill.label}</Pill>
                      {(p.customer_comment || p.responder) && (
                        <span className="text-[12px] opacity-80">
                          {p.customer_comment ? `“${p.customer_comment}”` : ""}
                          {p.responder && ` · ${p.responder.full_name}`}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5 text-[12px]">
                      {p.physical_delivery === "courier" && (
                        <span>
                          {p.courier ?? "Courier"}{" "}
                          {p.tracking_number ? (
                            trackingUrl(p.courier, p.tracking_number) ? (
                              <a href={trackingUrl(p.courier, p.tracking_number)!} target="_blank" rel="noreferrer" className="font-mono">
                                {p.tracking_number} ↗
                              </a>
                            ) : (
                              <span className="font-mono">{p.tracking_number}</span>
                            )
                          ) : (
                            <span className="opacity-60">no tracking yet</span>
                          )}
                        </span>
                      )}
                      {p.physical_delivery === "peniel_driver" && (
                        <span title="Internal only">
                          🔒︎ {p.delivery_driver ?? "Driver"}
                          {p.delivery_vehicle && ` · ${p.delivery_vehicle}`}
                        </span>
                      )}
                      {!p.physical_delivery && <span className="opacity-60">Portal only</span>}
                      {canEdit && (
                        <DispatchDialog
                          proofId={p.id}
                          label={`${p.brands?.name ?? ""} v${p.version ?? "?"}`}
                          current={
                            p.physical_delivery
                              ? {
                                  method: p.physical_delivery,
                                  courier: p.courier ?? "DHL",
                                  tracking: p.tracking_number ?? "",
                                  driver: p.delivery_driver ?? "",
                                  vehicle: p.delivery_vehicle ?? "",
                                }
                              : NO_DELIVERY
                          }
                        />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 bg-surface px-4 py-6 sm:px-8 xl:pl-6">
          {canEdit ? (
            <SendProofPanel
              companyId={companyId}
              minDate={addisDateISO(new Date())}
              brands={mine.map((b) => {
                const latest = latestPerBrand(b.id);
                return {
                  id: b.id,
                  name: b.name,
                  lastRequest:
                    latest?.status === "changes_requested" && latest.customer_comment
                      ? { version: latest.version, comment: latest.customer_comment, by: latest.responder?.full_name ?? null, at: latest.responded_at }
                      : null,
                };
              })}
              orders={(orders ?? [])
                .filter((o) => o.company_id === companyId)
                .map((o) => ({ id: o.id, brand_id: o.brand_id, status: o.status, label: `${o.order_no} · ${o.brands?.name ?? ""}` }))}
            />
          ) : (
            <p className="m-0 text-[13px]">Only Sales and Admin send proofs.</p>
          )}
          {canEdit &&
            lockable.map((p) => (
              <form key={p.id} action={lockArtwork} className="flex flex-col gap-2 border-t-2 border-divider pt-4">
                <input type="hidden" name="proof_id" value={p.id} />
                <b className="text-[14px]">
                  {p.brands?.name} proof v{p.version} · approved {formatDate(p.responded_at)}
                </b>
                <button type="submit" className="btn btn-secondary btn-split text-text">
                  Lock v{p.version} as the approved {p.brands?.name} artwork<span aria-hidden="true">🔒︎</span>
                </button>
              </form>
            ))}
        </div>
      </div>
    </>
  );
}
