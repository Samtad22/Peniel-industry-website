import type { Metadata } from "next";
import NewOrderWizard, { type WizardBrand, type WizardInitial, type WizardRecent } from "@/components/customer/NewOrderWizard";
import { requireCustomer } from "@/lib/auth";
import { brandSpec, type CustomerBrand } from "@/lib/customer-orders";
import type { AttachmentType } from "@/lib/files";
import { addisDateISO } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New order" };

type Recent = {
  id: string;
  order_no: string;
  brand_id: string;
  brand_name: string;
  po_number: string;
  quantity: number;
  due_date: string | null;
  delivery_method: "pickup" | "delivery";
  delivery_address: string | null;
  status: OrderStatus;
};

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; reorder?: string; po_from?: string }>;
}) {
  const profile = await requireCustomer();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: brands }, { data: recent }] = await Promise.all([
    supabase
      .from("customer_brands")
      .select("id, name, size, finish, liner, colours, active")
      .eq("active", true)
      .order("name")
      .returns<CustomerBrand[]>(),
    supabase
      .from("customer_orders")
      .select("id, order_no, brand_id, brand_name, po_number, quantity, due_date, delivery_method, delivery_address, status")
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<Recent[]>(),
  ]);

  const wizardBrands: WizardBrand[] = (brands ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    spec: brandSpec(b),
    size: b.size,
    finish: b.finish,
    liner: b.liner,
    colours: b.colours,
  }));
  const recentOrders: WizardRecent[] = (recent ?? [])
    .filter((o) => wizardBrands.some((b) => b.id === o.brand_id))
    .map((o) => ({
      id: o.id,
      order_no: o.order_no,
      brand_id: o.brand_id,
      brand_name: o.brand_name,
      quantity: Number(o.quantity),
      due_date: o.due_date,
      delivery_method: o.delivery_method,
      delivery_address: o.delivery_address,
    }));

  const initial: WizardInitial = { step: 1 };
  if (sp.brand && wizardBrands.some((b) => b.id === sp.brand)) {
    initial.brandId = sp.brand;
    initial.step = 2;
  }
  const reorder = sp.reorder ? recentOrders.find((o) => o.id === sp.reorder) : undefined;
  if (reorder) {
    initial.reorderFrom = reorder.id;
    initial.step = 2;
  }
  if (sp.po_from && /^[0-9a-f-]{36}$/i.test(sp.po_from)) {
    // "Order another brand on this PO": same PO number and PO file(s).
    const [{ data: from }, { data: files }] = await Promise.all([
      supabase.from("customer_orders").select("order_no, po_number").eq("id", sp.po_from).maybeSingle<{ order_no: string; po_number: string }>(),
      supabase
        .from("customer_order_attachments")
        .select("file_name, file_path, size_bytes, type")
        .eq("order_id", sp.po_from)
        .eq("type", "purchase_order")
        .returns<{ file_name: string; file_path: string; size_bytes: number; type: AttachmentType }[]>(),
    ]);
    if (from) {
      initial.poFrom = {
        order_no: from.order_no,
        po_number: from.po_number,
        files: (files ?? []).map((f) => ({ name: f.file_name, path: f.file_path, size: Number(f.size_bytes), type: f.type })),
      };
    }
  }

  return (
    <NewOrderWizard
      companyId={profile.company_id}
      brands={wizardBrands}
      recent={recentOrders}
      initial={initial}
      minDate={addisDateISO(new Date())}
    />
  );
}
