"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { fileProblem, mimeFor, type AttachmentType } from "@/lib/files";
import { createClient } from "@/lib/supabase/server";

export type UploadState = { error?: string; ok?: string } | null;

const TYPES: AttachmentType[] = ["purchase_order", "specification", "other"];

/**
 * Record a file the customer has uploaded to one of their orders.
 * customer_add_order_attachment checks the order and the folder are theirs.
 */
export async function addOrderFile(input: { orderId: string; path: string; name: string; size: number; type: AttachmentType }): Promise<UploadState> {
  await requireCustomer();
  const problem = fileProblem(input);
  if (problem) return { error: problem };
  if (!TYPES.includes(input.type)) return { error: "Choose the document type." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_add_order_attachment", {
    p_order_id: input.orderId,
    p_file_path: input.path,
    p_file_name: input.name,
    p_size_bytes: input.size,
    p_mime_type: mimeFor(input.name),
    p_type: input.type,
  });
  if (error) return { error: "We couldn't attach the file. Please try again." };
  revalidatePath("/documents");
  revalidatePath("/orders");
  return { ok: "Uploaded. Peniel can see it on the order." };
}
