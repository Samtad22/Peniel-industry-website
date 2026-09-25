"use client";

import { useState, useTransition } from "react";
import { setCrownImage } from "@/app/ops/customers/actions";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/form";
import { fileProblem, safeFileName } from "@/lib/files";
import { brandSlug } from "@/lib/inks";
import { uploadToStorage } from "@/lib/upload";

type Row = { file: File; brand: { id: string; name: string } | null; status: "ready" | "uploading" | "done" | "error"; message?: string };

/** Several crown images at once: each file is matched to the brand with the same name ("st-george.png" → St. George). */
export default function CrownImport({ companyId, companyName, brands }: { companyId: string; companyName: string; brands: { id: string; name: string }[] }) {
  return (
    <Modal
      title={`Crown images for ${companyName}`}
      wide
      trigger={(open) => (
        <Button type="button" variant="secondary" onClick={open} className="whitespace-nowrap text-text">
          Import crown images
        </Button>
      )}
    >
      {(close) => <CrownImportForm companyId={companyId} brands={brands} close={close} />}
    </Modal>
  );
}

function CrownImportForm({ companyId, brands, close }: { companyId: string; brands: { id: string; name: string }[]; close: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, start] = useTransition();
  const bySlug = new Map(brands.map((b) => [brandSlug(b.name), b]));

  const choose = (files: FileList | null) =>
    setRows(
      Array.from(files ?? []).map((file) => {
        const brand = bySlug.get(brandSlug(file.name.replace(/\.[^.]+$/, ""))) ?? null;
        const problem = !/\.(png|jpe?g)$/i.test(file.name) ? "Not a PNG or JPG" : fileProblem(file);
        return problem
          ? { file, brand, status: "error", message: problem }
          : { file, brand, status: brand ? "ready" : "error", message: brand ? undefined : "No brand with this name" };
      }),
    );

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const run = () =>
    start(async () => {
      for (const [i, r] of rows.entries()) {
        if (r.status !== "ready" || !r.brand) continue;
        set(i, { status: "uploading" });
        const path = `${companyId}/crowns/${r.brand.id}-${crypto.randomUUID()}/${safeFileName(r.file.name)}`;
        try {
          await uploadToStorage("crowns", r.file, path);
          const res = await setCrownImage({ brandId: r.brand.id, path, name: r.file.name, size: r.file.size });
          set(i, res?.ok ? { status: "done", message: "Saved" } : { status: "error", message: res?.error ?? "Couldn't save" });
        } catch (e) {
          set(i, { status: "error", message: (e as Error).message });
        }
      }
    });

  const ready = rows.filter((r) => r.status === "ready").length;
  const done = rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "error") && rows.some((r) => r.status === "done");

  return (
    <div className="flex flex-col gap-3.5 text-[13px]">
      <p className="m-0 opacity-80">
        Name each image after its brand, e.g. <code>{brands[0] ? `${brandSlug(brands[0].name)}.png` : "negus.png"}</code>. PNG or JPG, seen from the top.
        An image replaces the brand&apos;s current one.
      </p>
      <label className="flex cursor-pointer flex-col gap-1 border-2 border-dashed border-divider bg-neutral-100 p-5">
        <b className="text-[15px]">
          Choose images <span className="text-accent underline underline-offset-2">browse</span>
        </b>
        <span className="opacity-70">Brands: {brands.map((b) => b.name).join(", ")}</span>
        <input type="file" multiple accept=".png,.jpg,.jpeg" className="sr-only" onChange={(e) => choose(e.target.files)} disabled={pending} />
      </label>
      {rows.length > 0 && (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-divider text-left">
              <th className="py-1.5 pr-3">File</th>
              <th className="py-1.5 pr-3">Brand</th>
              <th className="py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-divider">
                <td className="max-w-[200px] truncate py-1.5 pr-3">{r.file.name}</td>
                <td className="py-1.5 pr-3">{r.brand?.name ?? "—"}</td>
                <td className={`py-1.5 ${r.status === "error" ? "font-bold text-accent-800" : ""}`}>
                  {r.status === "ready" ? "Ready" : r.status === "uploading" ? "Uploading…" : r.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {done ? "Done" : "Cancel"}
        </Button>
        <Button type="button" disabled={pending || ready === 0} onClick={run} icon="→" className="w-[190px]">
          {pending ? "Uploading…" : `Upload ${ready || ""} image${ready === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
