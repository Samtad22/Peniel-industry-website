"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { DOC_TYPES } from "@/lib/documents";
import { fileProblem, mimeFor } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";
import { notifyDocumentShared } from "@/lib/notify";

export type DocState = { error?: string; ok?: string } | null;

/** Admin, sales, quality and warehouse file documents (RLS enforces the same). */
const WRITERS = ["admin", "sales", "quality", "warehouse"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

export async function createDocument(input: {
  companyId: string;
  orderId: string;
  brandId: string;
  type: string;
  title: string;
  visibility: "customer" | "internal";
  path: string;
  name: string;
  size: number;
}): Promise<DocState> {
  const me = await requireStaff([...WRITERS]);
  if (!UUID.test(input.companyId)) return { error: "Choose the customer." };
  if (!(input.type in DOC_TYPES)) return { error: "Choose the document type." };
  if (!input.path.startsWith(`${input.companyId}/documents/`) || input.path.includes("..")) return { error: "Upload the file again." };
  const problem = fileProblem({ name: input.name, size: input.size });
  if (problem) return { error: problem };

  const supabase = await createClient();
  if (UUID.test(input.orderId)) {
    const { data: o } = await supabase.from("orders").select("company_id").eq("id", input.orderId).maybeSingle<{ company_id: string }>();
    if (o?.company_id !== input.companyId) return { error: "That order belongs to a different customer." };
  }
  const { data: doc, error } = await supabase.from("documents").insert({
    company_id: input.companyId,
    order_id: UUID.test(input.orderId) ? input.orderId : null,
    brand_id: UUID.test(input.brandId) ? input.brandId : null,
    type: input.type,
    title: input.title.trim().slice(0, 200) || input.name,
    file_name: input.name,
    file_path: input.path,
    size_bytes: input.size,
    mime_type: mimeFor(input.name),
    visibility: input.visibility === "customer" ? "customer" : "internal",
    uploaded_by: me.user_id,
  }).select("id").single<{ id: string }>();
  if (error || !doc) return { error: /row-level|permission/i.test(error.message) ? "Your role can't file documents." : "Couldn't save the document." };
  revalidatePath("/ops/documents");
  revalidatePath("/documents");
  if (input.visibility === "customer") notifyDocumentShared(doc.id);
  return { ok: input.visibility === "customer" ? "Uploaded. The customer can see it now." : "Uploaded. Internal only." };
}

export async function setDocumentVisibility(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  const vis = fd.get("visibility") === "customer" ? "customer" : "internal";
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: changed } = await supabase.from("documents").update({ visibility: vis }).eq("id", id).select("id");
  if (vis === "customer" && changed?.length) notifyDocumentShared(id);
  revalidatePath("/ops/documents");
  revalidatePath("/documents");
}
