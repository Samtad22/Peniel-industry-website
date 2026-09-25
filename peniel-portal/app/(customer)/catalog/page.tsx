import type { Metadata } from "next";
import Link from "next/link";
import { CustomerPageHead } from "@/components/customer/CustomerPlanned";
import Crown, { crownSrc, InkSwatches } from "@/components/ui/Crown";
import { brandSpec, type CustomerBrand } from "@/lib/customer-orders";
import { formatDate } from "@/lib/format";
import { crownSizeLine } from "@/lib/inks";
import { statusText, type OrderStatus } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Crown cork catalog" };

type Last = { id: string; order_no: string; brand_name: string; quantity: number; status: OrderStatus; due_date: string | null };

/** Your brands as order-ready tiles (design 1p: "Add to order"). */
export default async function CatalogPage() {
  const supabase = await createClient();
  const [{ data: company }, { data: brands }, { data: last }] = await Promise.all([
    supabase.from("customer_company").select("name").maybeSingle<{ name: string }>(),
    supabase
      .from("customer_brands")
      .select("id, name, size, finish, liner, colours, crown_image_path, active")
      .eq("active", true)
      .order("name")
      .returns<CustomerBrand[]>(),
    supabase
      .from("customer_orders")
      .select("id, order_no, brand_name, quantity, status, due_date")
      .not("status", "in", "(submitted,rejected)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Last>(),
  ]);

  const tile = "flex flex-col gap-3 border-b-2 border-r-2 border-divider px-4 py-6 sm:px-10";

  return (
    <>
      <CustomerPageHead
        section="Catalog"
        title="Crown cork catalog"
        aside={<div className="text-[13px] opacity-70">Ordering as {company?.name ?? "your company"}</div>}
      />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {(brands ?? []).map((b) => (
          <div key={b.id} className={tile}>
            <div className="grid h-[180px] place-items-center bg-surface">
              <Crown colours={b.colours} src={crownSrc(b)} size={140} alt={`${b.name} crown`} />
            </div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-accent-700">{brandSpec(b)}</div>
            <h4 className="m-0">{b.name}</h4>
            <div className="border-t border-divider text-[13px]">
              {([
                ["Size", crownSizeLine(b.size)],
                ["Liner", b.liner],
                ["Finish", b.finish ?? "—"],
                ["Colours", <InkSwatches key="c" colours={b.colours} compact />],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[100px_1fr] border-b border-divider py-1.5">
                  <span className="opacity-60">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <Link href={`/orders/new?brand=${b.id}`} className="btn btn-secondary btn-split mt-auto text-text">
              Add to order<span aria-hidden="true">+</span>
            </Link>
          </div>
        ))}

        {last && (
          <div className={tile}>
            <div className="grid h-[150px] place-items-center bg-neutral-200 text-[13px] font-extrabold">↻</div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-accent-700">Reorder</div>
            <h4 className="m-0">Your last order: {last.order_no}</h4>
            <div className="border-t border-divider text-[13px]">
              {[
                ["Brand", last.brand_name],
                ["Quantity", Number(last.quantity).toLocaleString("en-US")],
                ["Status", statusText(last.status, "customer")],
                ["Due", formatDate(last.due_date)],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[100px_1fr] border-b border-divider py-1.5">
                  <span className="opacity-60">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <Link href={`/orders/new?reorder=${last.id}`} className="btn btn-primary btn-split mt-auto">
              Reorder<span aria-hidden="true">↻</span>
            </Link>
          </div>
        )}

        <div className={tile}>
          <div className="text-[11px] uppercase tracking-[0.1em] text-accent-700">New brand or design</div>
          <h4 className="m-0">Need a crown that isn&apos;t listed?</h4>
          <p className="m-0 text-[14px]">
            New brands and printed designs are set up with Peniel first: we agree the specification and artwork with you,
            then the brand appears here ready to order.
          </p>
          <a href="https://penielindustry.org/contact" className="btn btn-secondary btn-split mt-auto text-text">
            Contact Peniel<span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </>
  );
}
