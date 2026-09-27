"use client";

import { useState, useTransition } from "react";
import { addLibraryFiles, deleteLibraryFile, type LibraryState, type LibraryUpload } from "@/app/ops/artwork/library-actions";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { InternalOnly } from "@/components/ui/Visibility";
import { LIBRARY_FOLDER, LIBRARY_LABELS, SHEET_UPS, type LibraryKind } from "@/lib/artwork-library";
import { fileExt, fileProblem, formatBytes, LIBRARY_ACCEPT, safeFileName } from "@/lib/files";
import { uploadToStorage } from "@/lib/upload";

type BrandPick = { id: string; name: string };

/** "Add files" to one section of the artwork library, for a brand of this customer. */
export function LibraryUploadDialog({ kind, companyId, brands, brandId }: { kind: LibraryKind; companyId: string; brands: BrandPick[]; brandId?: string }) {
  const one = brands.find((b) => b.id === brandId);
  return (
    <Modal
      wide
      title={`${LIBRARY_LABELS[kind].title}${one ? ` · ${one.name}` : ""}`}
      trigger={(open) =>
        one ? (
          <button type="button" onClick={open} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold underline underline-offset-2">
            + Add
          </button>
        ) : (
          <Button type="button" variant="secondary" onClick={open} icon="↑" className="whitespace-nowrap text-text" disabled={brands.length === 0}>
            Add files
          </Button>
        )
      }
    >
      {(close) => <UploadForm kind={kind} companyId={companyId} brands={brands} brandId={brandId} close={close} />}
    </Modal>
  );
}

function UploadForm({ kind, companyId, brands, brandId, close }: { kind: LibraryKind; companyId: string; brands: BrandPick[]; brandId?: string; close: () => void }) {
  const [brand, setBrand] = useState(brandId ?? (brands.length === 1 ? brands[0].id : ""));
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [ups, setUps] = useState(String(SHEET_UPS));
  const [progress, setProgress] = useState<string | null>(null);
  const [state, setState] = useState<LibraryState>(null);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState(false);

  const problems = files.map((f) => fileProblem(f, "library"));
  const ready = brand && files.length > 0 && problems.every((p) => !p) && progress === null;
  const addFiles = (list: FileList | null) => list && setFiles((cur) => [...cur, ...Array.from(list)].slice(0, 50));

  const upload = () => {
    if (!ready) return;
    setState(null);
    start(async () => {
      const done: LibraryUpload[] = [];
      for (const [i, f] of files.entries()) {
        const path = `${companyId}/${LIBRARY_FOLDER[kind]}/${brand}/${crypto.randomUUID()}/${safeFileName(f.name)}`;
        try {
          await uploadToStorage("artwork-library", f, path, (p) => setProgress(`${i + 1} of ${files.length}: ${p}%`));
        } catch (e) {
          setProgress(null);
          setState({ error: `${f.name}: ${(e as Error).message}` });
          return;
        }
        done.push({ path, name: f.name, size: f.size });
      }
      const res = await addLibraryFiles({ kind, brandId: brand, files: done, title, notes, ups: kind === "print_layout" ? Number(ups.replace(/[,\s]/g, "")) : null });
      setProgress(null);
      setState(res);
      if (res?.ok) setFiles([]);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 text-[13px] opacity-75">{LIBRARY_LABELS[kind].sub}</p>
      {kind === "print_layout" && (
        <div className="flex justify-end">
          <InternalOnly />
        </div>
      )}
      {!brandId && (
        <Field label="Brand" htmlFor="lib-brand">
          <select id="lib-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className="input min-h-11">
            <option value="">Choose a brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label
        htmlFor={`lib-files-${kind}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col gap-1 border-2 border-dashed p-5 text-[13px] ${drag ? "border-accent bg-accent-100" : "border-divider bg-neutral-100"}`}
      >
        <b>Drop files here or choose them</b>
        <span className="opacity-70">AI, EPS, PDF, JPG or PNG · up to 200 MB each · several at once</span>
        <input id={`lib-files-${kind}`} type="file" multiple accept={LIBRARY_ACCEPT} onChange={(e) => addFiles(e.target.files)} className="sr-only" />
      </label>
      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={`grid grid-cols-[40px_minmax(0,1fr)_28px] items-center gap-2.5 p-2 text-[13px] ${problems[i] ? "bg-accent-100" : "bg-surface"}`}>
              <span className="bg-bg py-1 text-center font-mono text-[10px] font-semibold">{fileExt(f.name)}</span>
              <span className="min-w-0">
                <b className="block truncate">{f.name}</b>
                <span className={problems[i] ? "font-extrabold text-accent-800" : "opacity-60"}>{problems[i] ?? formatBytes(f.size)}</span>
              </span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="cursor-pointer border-0 bg-transparent text-[18px]">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`grid gap-3.5 ${kind === "print_layout" ? "sm:grid-cols-[minmax(0,1fr)_160px]" : ""}`}>
        {files.length <= 1 && (
          <Field label="Title (optional)" htmlFor="lib-title">
            <input id="lib-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={files[0]?.name ?? "e.g. Habesha crown, 2024 design"} className="input min-h-11" />
          </Field>
        )}
        {kind === "print_layout" && (
          <Field label="Crowns on the sheet" htmlFor="lib-ups">
            <input id="lib-ups" inputMode="numeric" value={ups} onChange={(e) => setUps(e.target.value)} className="input min-h-11" />
          </Field>
        )}
      </div>
      <Field label="Notes (optional)" htmlFor="lib-notes">
        <textarea id="lib-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder={kind === "print_layout" ? "e.g. plate size, which press" : "e.g. dimensions, Pantone colours"} className="input !min-h-[56px]" />
      </Field>

      {progress && <p className="m-0 text-[12px]">Uploading {progress}</p>}
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="button" onClick={upload} disabled={!ready || pending} icon="↑" className="w-[190px]">
          {pending ? "Uploading…" : files.length > 1 ? `Add ${files.length} files` : "Add file"}
        </Button>
      </div>
    </div>
  );
}

/** Remove a file from the library. */
export function DeleteLibraryFile({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteLibraryFile}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from the library?`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" aria-label={`Remove ${name}`} className="cursor-pointer border-0 bg-transparent p-0 text-[14px] leading-none text-accent-800">
        ×
      </button>
    </form>
  );
}
