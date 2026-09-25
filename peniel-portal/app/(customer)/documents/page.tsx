import type { Metadata } from "next";
import Link from "next/link";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import UploadDocumentDialog from "@/components/customer/UploadDocumentDialog";
import { requireCustomer } from "@/lib/auth";
import { docTypeLabel } from "@/lib/documents";
import { ATTACHMENT_TYPE_LABELS, fileExt, formatBytes, type AttachmentType } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documents" };

type Row = { key: string; href: string; name: string; file: string; type: string; order_id: string | null; created_at: string; size: number | null; yours: boolean };

/**
 * Customer documents (designs 1m–1o): files Peniel shared (customer-visible
 * only) and the files you attached to your orders. Customer views only.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string; order?: string; q?: string }> }) {
  const profile = await requireCustomer();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: docs }, { data: files }, { data: orders }] = await Promise.all([
    supabase
      .from("customer_documents")
      .select("id, type, title, file_name, order_id, created_at, size_bytes")
      .order("created_at", { ascending: false })
      .returns<{ id: string; type: string; title: string; file_name: string; order_id: string | null; created_at: string; size_bytes: number | null }[]>(),
    supabase
      .from("customer_order_attachments")
      .select("id, file_name, type, order_id, created_at, size_bytes")
      .order("created_at", { ascending: false })
      .returns<{ id: string; file_name: string; type: AttachmentType; order_id: string; created_at: string; size_bytes: number }[]>(),
    supabase
      .from("customer_orders")
      .select("id, order_no, po_number, brand_name, status")
      .order("created_at", { ascending: false })
      .returns<{ id: string; order_no: string; po_number: string; brand_name: string; status: string }[]>(),
  ]);

  const orderNo = new Map((orders ?? []).map((o) => [o.id, o.order_no]));
  const all: Row[] = [
    ...(docs ?? []).map((d) => ({
      key: `d${d.id}`,
      href: `/files/documents/${d.id}`,
      name: d.title || d.file_name,
      file: d.file_name,
      type: docTypeLabel(d.type),
      order_id: d.order_id,
      created_at: d.created_at,
      size: d.size_bytes ? Number(d.size_bytes) : null,
      yours: false,
    })),
    ...(files ?? []).map((f) => ({
      key: `a${f.id}`,
      href: `/files/attachments/${f.id}`,
      name: f.file_name,
      file: f.file_name,
      type: ATTACHMENT_TYPE_LABELS[f.type],
      order_id: f.order_id,
      created_at: f.created_at,
      size: Number(f.size_bytes),
      yours: true,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = all.filter(
    (r) =>
      (!sp.type || r.type === sp.type) &&
      (!sp.order || r.order_id === sp.order) &&
      (!q || r.name.toLowerCase().includes(q) || (r.order_id && orderNo.get(r.order_id)?.toLowerCase().includes(q))),
  );
  const types = [...new Set(all.map((r) => r.type))].sort().map((t) => ({ t, n: all.filter((r) => r.type === t).length }));
  const link = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ type: sp.type, order: sp.order, q: sp.q, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    return s ? `/documents?${s}` : "/documents";
  };
  const uploadOrders = (orders ?? [])
    .filter((o) => o.status !== "rejected")
    .map((o) => ({ id: o.id, label: `${o.order_no} · ${o.po_number} · ${o.brand_name}` }));

  if (all.length === 0) {
    return (
      <>
        <CustomerPageHead section="Documents" title="Documents" aside={<UploadDocumentDialog companyId={profile.company_id} orders={uploadOrders} />} />
        <div className="grid gap-10 px-4 py-12 sm:px-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex max-w-[560px] flex-col gap-4">
            <h2 className="m-0">No documents yet.</h2>
            <p className="m-0 text-[16px]">
              Invoices, delivery notes and QC certificates appear here as Peniel shares them. You can also upload POs and
              specifications to your orders yourself.
            </p>
            <div>
              <UploadDocumentDialog companyId={profile.company_id} orders={uploadOrders} label="Upload your first document ↑" variant="secondary" />
            </div>
          </div>
          <div className="border-t-2 border-text text-[14px]">
            {[
              ["Purchase orders", "Uploaded by you"],
              ["Pro forma invoices · Invoices", "From Peniel"],
              ["Delivery notes", "At pickup or dispatch"],
              ["QC certificates", "Per released batch"],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between gap-3 border-b border-divider py-2.5">
                <b>{a}</b>
                <span className="opacity-70">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <CustomerPageHead
        section="Documents"
        title="Documents"
        aside={
          <div className="flex flex-wrap items-center gap-3">
            <form action="/documents" role="search">
              {sp.type && <input type="hidden" name="type" value={sp.type} />}
              {sp.order && <input type="hidden" name="order" value={sp.order} />}
              <label htmlFor="doc-q" className="sr-only">
                Search file name or order number
              </label>
              <input id="doc-q" name="q" type="search" defaultValue={sp.q} placeholder="Search file name or order no." className="input w-[280px] max-sm:w-full" />
            </form>
            <UploadDocumentDialog companyId={profile.company_id} orders={uploadOrders} />
          </div>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 border-divider px-4 py-6 sm:px-10 max-lg:border-b-2 lg:border-r-2 lg:pr-6">
          <div>
            <h6 className="mb-2 mt-0">Type</h6>
            <div className="flex flex-col text-[14px]">
              <Link href={link({ type: undefined })} className={`flex justify-between py-1.5 no-underline ${!sp.type ? "font-extrabold text-accent" : "text-text"}`}>
                <span>All</span>
                <span>{all.length}</span>
              </Link>
              {types.map(({ t, n }) => (
                <Link key={t} href={link({ type: t })} className={`flex justify-between py-1.5 no-underline ${sp.type === t ? "font-extrabold text-accent" : "text-text"}`}>
                  <span>{t}</span>
                  <span>{n}</span>
                </Link>
              ))}
            </div>
          </div>
          <form action="/documents" className="field">
            {sp.type && <input type="hidden" name="type" value={sp.type} />}
            <label htmlFor="doc-order">Order</label>
            <select id="doc-order" name="order" defaultValue={sp.order ?? ""} className="input">
              <option value="">All orders</option>
              {(orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary mt-2 text-text">
              Show
            </button>
          </form>
        </aside>
        <div className="min-w-0 px-4 py-6 sm:px-10">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="th-row grid grid-cols-[44px_minmax(0,1fr)_170px_110px_120px_80px_32px] gap-3 border-b-2 border-divider py-2">
                <span />
                <span>File</span>
                <span>Type</span>
                <span>Order no.</span>
                <span>Date</span>
                <span>Size</span>
                <span />
              </div>
              {shown.length === 0 && <p className="m-0 py-3 text-[14px] opacity-70">No documents match.</p>}
              {shown.map((r) => (
                <a
                  key={r.key}
                  href={r.href}
                  className="grid min-h-12 grid-cols-[44px_minmax(0,1fr)_170px_110px_120px_80px_32px] items-center gap-3 border-b border-divider py-2 text-[14px] text-text no-underline hover:bg-text/5 hover:text-text"
                >
                  <span className="bg-surface py-1 text-center font-mono text-[10px] font-semibold">{fileExt(r.file)}</span>
                  <b className="truncate">{r.name}</b>
                  <span>
                    <span className="tag tag-neutral">
                      {r.type}
                      {r.yours && " · yours"}
                    </span>
                  </span>
                  <span>{r.order_id ? (orderNo.get(r.order_id) ?? "-") : "-"}</span>
                  <span>{formatDate(r.created_at)}</span>
                  <span>{r.size ? formatBytes(r.size) : "-"}</span>
                  <span className="text-center font-extrabold text-accent" aria-label={`Download ${r.name}`}>
                    ↓
                  </span>
                </a>
              ))}
            </div>
          </div>
          <div className="mt-3 text-[12px] opacity-70">
            {shown.length} of {all.length} documents
          </div>
        </div>
      </div>
    </>
  );
}
