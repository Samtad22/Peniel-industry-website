import type { Metadata } from "next";
import Link from "next/link";
import { setDocumentVisibility } from "@/app/ops/documents/actions";
import DocUploadPanel from "@/components/ops/DocUploadPanel";
import OpsHeader from "@/components/ops/OpsHeader";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { DOC_TYPES, docTypeLabel } from "@/lib/documents";
import { fileExt, formatBytes } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documents" };

type Doc = {
  id: string;
  type: string;
  title: string;
  file_name: string;
  size_bytes: number | null;
  visibility: "customer" | "internal";
  created_at: string;
  order_id: string | null;
  companies: { name: string } | null;
  brands: { name: string } | null;
  orders: { order_no: string } | null;
};

/** Staff documents: every file, who can see it, and upload (design 1n). */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; type?: string; vis?: string }>;
}) {
  const me = await requireStaff(opsRolesFor("documents"));
  const sp = await searchParams;
  const supabase = await createClient();
  const canWrite = ["admin", "sales", "quality", "warehouse"].includes(me.role);

  let q = supabase
    .from("documents")
    .select("id, type, title, file_name, size_bytes, visibility, created_at, order_id, companies(name), brands(name), orders(order_no)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.customer && /^[0-9a-f-]{36}$/i.test(sp.customer)) q = q.eq("company_id", sp.customer);
  if (sp.type && sp.type in DOC_TYPES) q = q.eq("type", sp.type);
  if (sp.vis === "customer" || sp.vis === "internal") q = q.eq("visibility", sp.vis);

  const [{ data: docs }, { data: companies }, { data: orders }, { data: brands }] = await Promise.all([
    q.returns<Doc[]>(),
    supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("orders")
      .select("id, company_id, order_no, brands(name)")
      .order("order_no", { ascending: false })
      .limit(500)
      .returns<{ id: string; company_id: string; order_no: string; brands: { name: string } | null }[]>(),
    supabase.from("brands").select("id, company_id, name").order("name").returns<{ id: string; company_id: string; name: string }[]>(),
  ]);

  const visLink = (v: string) => {
    const p = new URLSearchParams();
    if (sp.customer) p.set("customer", sp.customer);
    if (sp.type) p.set("type", sp.type);
    if (v !== "all") p.set("vis", v);
    const s = p.toString();
    return s ? `/ops/documents?${s}` : "/ops/documents";
  };
  const vis = sp.vis === "customer" || sp.vis === "internal" ? sp.vis : "all";
  const COLS = "grid grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_100px_100px_150px] items-center gap-3";

  return (
    <>
      <OpsHeader title="Documents" />
      <div className="grid grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 border-divider px-4 py-5 sm:px-8 xl:border-r-2">
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <div className="field w-[220px]">
              <label htmlFor="f-cust">Customer</label>
              <select id="f-cust" name="customer" defaultValue={sp.customer ?? ""} className="input">
                <option value="">All customers</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field w-[200px]">
              <label htmlFor="f-type">Type</label>
              <select id="f-type" name="type" defaultValue={sp.type ?? ""} className="input">
                <option value="">All types</option>
                {Object.entries(DOC_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            {vis !== "all" && <input type="hidden" name="vis" value={vis} />}
            <button type="submit" className="btn btn-secondary text-text">
              Apply
            </button>
            <div className="seg ml-auto">
              {(
                [
                  ["all", "All"],
                  ["customer", "Customer-visible"],
                  ["internal", "Internal"],
                ] as const
              ).map(([k, v]) => (
                <Link key={k} href={visLink(k)} className={`seg-opt no-underline ${vis === k ? "!bg-accent !text-bg" : "text-text"}`}>
                  {v}
                </Link>
              ))}
            </div>
          </form>
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className={`${COLS} th-row border-b-2 border-divider py-2`}>
                <span>File</span>
                <span>Type</span>
                <span>Customer · brand</span>
                <span>Order</span>
                <span>Date</span>
                <span>Visibility</span>
              </div>
              {(docs ?? []).length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No documents match.</p>}
              {(docs ?? []).map((d) => (
                <div key={d.id} className={`${COLS} border-b border-divider py-2.5 text-[13px]`}>
                  <a href={`/files/documents/${d.id}`} className="flex min-w-0 items-center gap-2 text-text no-underline hover:underline">
                    <span className="w-9 shrink-0 bg-surface py-0.5 text-center font-mono text-[10px] font-semibold">{fileExt(d.file_name)}</span>
                    <span className="min-w-0">
                      <b className="block truncate">{d.title}</b>
                      <span className="text-[11px] opacity-60">{d.size_bytes ? formatBytes(Number(d.size_bytes)) : d.file_name}</span>
                    </span>
                  </a>
                  <span>
                    <span className="tag tag-neutral">{docTypeLabel(d.type)}</span>
                  </span>
                  <span className="truncate">
                    {d.companies?.name ?? "—"}
                    {d.brands?.name && ` · ${d.brands.name}`}
                  </span>
                  <span>
                    {d.order_id ? (
                      <Link href={`/ops/orders/${d.order_id}`} className="text-text">
                        {d.orders?.order_no}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span>{formatDate(d.created_at)}</span>
                  <span className="flex items-center gap-2">
                    {d.visibility === "customer" ? <CustomerSees>Customer</CustomerSees> : <InternalOnly>Internal</InternalOnly>}
                    {canWrite && (
                      <form action={setDocumentVisibility}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="visibility" value={d.visibility === "customer" ? "internal" : "customer"} />
                        <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[11px] underline" title="Change who can see this">
                          change
                        </button>
                      </form>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {canWrite && (
          <div className="bg-surface px-4 py-6 sm:px-8 xl:pl-6">
            <DocUploadPanel
              companies={companies ?? []}
              orders={(orders ?? []).map((o) => ({ id: o.id, company_id: o.company_id, name: `${o.order_no} · ${o.brands?.name ?? ""}` }))}
              brands={brands ?? []}
            />
          </div>
        )}
      </div>
    </>
  );
}
