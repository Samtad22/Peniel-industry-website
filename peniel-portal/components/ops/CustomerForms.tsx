"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addArtworkOnFile,
  clearCrownImage,
  retireBrand,
  saveBrand,
  saveCompany,
  setCrownImage,
  type CustomerState,
} from "@/app/ops/customers/actions";
import Crown, { crownSrc } from "@/components/ui/Crown";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";
import { ARTWORK_ACCEPT, fileProblem, safeFileName } from "@/lib/files";
import { pantoneHex, parseInks, type Ink } from "@/lib/inks";
import { uploadToStorage } from "@/lib/upload";

export type CompanyFields = {
  id: string;
  name: string;
  code: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
};

export type BrandFields = {
  id: string;
  name: string;
  size: string;
  liner: string;
  finish: string | null;
  colours: string[];
  crown_image_path: string | null;
  /** "v2 approved" / "No approved artwork". */
  artwork: string;
};

/** "+ New customer" / "Edit details" (admin). */
export function CompanyDialog({ company, triggerLabel, variant = "primary" }: { company?: CompanyFields; triggerLabel: string; variant?: "primary" | "secondary" }) {
  return (
    <Modal
      title={company ? `Edit ${company.name}` : "New customer"}
      trigger={(open) => (
        <Button type="button" variant={variant} onClick={open} className={variant === "secondary" ? "whitespace-nowrap text-text" : "whitespace-nowrap"}>
          {triggerLabel}
        </Button>
      )}
    >
      {(close) => <CompanyForm company={company} close={close} />}
    </Modal>
  );
}

function CompanyForm({ company, close }: { company?: CompanyFields; close: () => void }) {
  const [state, action, pending] = useActionState<CustomerState, FormData>(saveCompany, null);
  return (
    <form action={action} className="flex flex-col gap-3.5">
      {company && <input type="hidden" name="id" value={company.id} />}
      <Field label="Company name" htmlFor="co-name">
        <input id="co-name" name="name" required maxLength={200} defaultValue={company?.name} placeholder="Habesha Brewery S.C." className="input min-h-11" autoFocus />
      </Field>
      <Field label="Customer ID" htmlFor="co-code">
        <input id="co-code" name="code" maxLength={20} defaultValue={company?.code} placeholder={company ? "" : "Leave empty to create one, e.g. HB-001"} className="input min-h-11" />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Contact person" htmlFor="co-contact">
          <input id="co-contact" name="contact_name" maxLength={200} defaultValue={company?.contact_name ?? ""} className="input min-h-11" />
        </Field>
        <Field label="Contact phone" htmlFor="co-phone">
          <input id="co-phone" name="contact_phone" maxLength={50} defaultValue={company?.contact_phone ?? ""} placeholder="+251 …" className="input min-h-11" />
        </Field>
      </div>
      <Field label="Contact email" htmlFor="co-email">
        <input id="co-email" name="contact_email" type="email" maxLength={200} defaultValue={company?.contact_email ?? ""} placeholder="procurement@…" className="input min-h-11" />
      </Field>
      <Field label="Address / plant" htmlFor="co-address">
        <textarea id="co-address" name="address" maxLength={500} defaultValue={company?.address ?? ""} placeholder="e.g. Debre Birhan plant" className="input !min-h-[64px]" />
      </Field>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
          {pending ? "Saving…" : company ? "Save" : "Add customer"}
        </Button>
      </div>
    </form>
  );
}

/** "+ Add brand" / edit a brand (admin and sales). */
export function BrandDialog({ companyId, brand, triggerLabel, variant = "primary" }: { companyId: string; brand?: BrandFields; triggerLabel: string; variant?: "primary" | "secondary" | "link" }) {
  return (
    <Modal
      title={brand ? `Edit ${brand.name}` : "Add brand"}
      trigger={(open) =>
        variant === "link" ? (
          <button type="button" onClick={open} className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] text-accent underline underline-offset-2">
            {triggerLabel}
          </button>
        ) : (
          <Button type="button" variant={variant} onClick={open} className={variant === "secondary" ? "text-text" : undefined}>
            {triggerLabel}
          </Button>
        )
      }
    >
      {(close) => <BrandForm companyId={companyId} brand={brand} close={close} />}
    </Modal>
  );
}

function BrandForm({ companyId, brand, close }: { companyId: string; brand?: BrandFields; close: () => void }) {
  const [state, action, pending] = useActionState<CustomerState, FormData>(saveBrand, null);
  return (
    <div className="flex flex-col gap-3.5">
      <form action={action} className="flex flex-col gap-3.5">
        <input type="hidden" name="company_id" value={companyId} />
        {brand && <input type="hidden" name="id" value={brand.id} />}
        <Field label="Brand name" htmlFor="br-name">
          <input id="br-name" name="name" required maxLength={100} defaultValue={brand?.name} placeholder="e.g. Negus" className="input min-h-11" autoFocus />
        </Field>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <Field label="Crown size" htmlFor="br-size">
            <input id="br-size" name="size" maxLength={20} defaultValue={brand?.size ?? "26mm"} className="input min-h-11" />
          </Field>
          <Field label="Liner" htmlFor="br-liner">
            <select id="br-liner" name="liner" defaultValue={brand?.liner ?? "PVC-free"} className="input min-h-11">
              <option value="PVC-free">PVC-free</option>
              <option value="PVC">PVC</option>
            </select>
          </Field>
          <Field label="Finish" htmlFor="br-finish">
            <input id="br-finish" name="finish" maxLength={50} defaultValue={brand?.finish ?? ""} placeholder="Gloss" className="input min-h-11" />
          </Field>
        </div>
        <InkEditor initial={parseInks(brand?.colours)} />
        <FormMessage state={state} />
        <div className="dialog-actions">
          {brand && (
            <button
              type="submit"
              formAction={retireBrand}
              formNoValidate
              title="Hide from new orders; past orders keep it"
              className="mr-auto cursor-pointer border-0 bg-transparent p-0 text-[13px] text-accent-800 underline underline-offset-2"
            >
              Retire brand
            </button>
          )}
          <Button type="button" variant="secondary" onClick={close}>
            {state?.ok ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" disabled={pending} icon="→" className="w-[150px]">
            {pending ? "Saving…" : brand ? "Save" : "Add brand"}
          </Button>
        </div>
      </form>
      {brand ? (
        <BrandFiles companyId={companyId} brand={brand} />
      ) : (
        <p className="m-0 text-[12px] opacity-70">Add the brand first, then its crown image and the artwork on file.</p>
      )}
    </div>
  );
}

const MAX_INKS = 8;

/** The brand's Pantone colours: name + on-screen swatch. Known Pantones fill in their swatch. */
function InkEditor({ initial }: { initial: Ink[] }) {
  const [inks, setInks] = useState<(Ink & { auto: boolean })[]>(() =>
    initial.length ? initial.map((i) => ({ ...i, auto: false })) : [{ name: "", hex: null, auto: true }],
  );
  const set = (i: number, patch: Partial<Ink & { auto: boolean }>) => setInks((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] font-bold">Pantone colours</legend>
      {inks.map((ink, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_44px_32px] items-center gap-2">
          <input
            name="ink_name"
            aria-label={`Colour ${i + 1}`}
            value={ink.name}
            maxLength={60}
            placeholder="e.g. PANTONE 485 C"
            className="input min-h-10"
            onChange={(e) => {
              const name = e.target.value;
              set(i, ink.auto || !ink.hex ? { name, hex: pantoneHex(name), auto: true } : { name });
            }}
          />
          <input type="hidden" name="ink_hex" value={ink.hex ?? ""} />
          <input
            type="color"
            aria-label={`Swatch for ${ink.name || `colour ${i + 1}`}`}
            title="On-screen swatch"
            value={ink.hex ?? "#ffffff"}
            onChange={(e) => set(i, { hex: e.target.value.toUpperCase(), auto: false })}
            className="h-10 w-11 cursor-pointer border border-divider bg-surface p-0.5"
          />
          <button
            type="button"
            aria-label={`Remove ${ink.name || `colour ${i + 1}`}`}
            onClick={() => setInks((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [{ name: "", hex: null, auto: true }]))}
            className="cursor-pointer border-0 bg-transparent text-[18px]"
          >
            ×
          </button>
        </div>
      ))}
      {inks.length < MAX_INKS && (
        <button
          type="button"
          onClick={() => setInks((xs) => [...xs, { name: "", hex: null, auto: true }])}
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] text-accent underline underline-offset-2"
        >
          + Add colour
        </button>
      )}
      <span className="text-[12px] opacity-70">
        Customers see these next to the crown when they order. The swatch is only an on-screen guide; print is matched to the Pantone.
      </span>
    </fieldset>
  );
}

/** Crown image (PNG/JPG) and the artwork Peniel holds on file (PDF/AI/EPS) for an existing brand. */
function BrandFiles({ companyId, brand }: { companyId: string; brand: BrandFields }) {
  const [state, setState] = useState<CustomerState>(null);
  const [busy, setBusy] = useState<"crown" | "artwork" | null>(null);
  const [crownPath, setCrownPath] = useState(brand.crown_image_path);
  const [artwork, setArtwork] = useState(brand.artwork);
  const [, start] = useTransition();

  const upload = (kind: "crown" | "artwork", file: File | undefined) => {
    if (!file) return;
    setState(null);
    if (kind === "crown" && !/\.(png|jpe?g)$/i.test(file.name)) return setState({ error: "Use a PNG or JPG image of the crown." });
    const problem = fileProblem(file, kind === "artwork" ? "artwork" : "document");
    if (problem) return setState({ error: problem });
    const folder = kind === "crown" ? "crowns" : "artwork";
    const path = `${companyId}/${folder}/${brand.id}-${crypto.randomUUID()}/${safeFileName(file.name)}`;
    setBusy(kind);
    start(async () => {
      try {
        await uploadToStorage(kind === "crown" ? "crowns" : "artwork", file, path);
      } catch (e) {
        setBusy(null);
        return setState({ error: (e as Error).message });
      }
      const input = { brandId: brand.id, path, name: file.name, size: file.size };
      const res = kind === "crown" ? await setCrownImage(input) : await addArtworkOnFile(input);
      setBusy(null);
      setState(res);
      if (res?.ok && kind === "crown") setCrownPath(path);
      const version = res?.ok && kind === "artwork" ? /^Saved as (v\d+)/.exec(res.ok)?.[1] : null;
      if (version) setArtwork(`${version} approved`);
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t-2 border-divider pt-3.5">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
        <Crown colours={brand.colours} src={crownSrc({ id: brand.id, crown_image_path: crownPath })} size={64} alt={`${brand.name} crown`} />
        <div className="flex flex-col gap-1 text-[13px]">
          <b>Crown image</b>
          <span className="text-[12px] opacity-70">A PNG or JPG of the printed crown, seen from the top. Customers see it when they order.</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer text-accent underline underline-offset-2">
              {busy === "crown" ? "Uploading…" : crownPath ? "Replace image" : "Upload image"}
              <input type="file" accept=".png,.jpg,.jpeg" className="sr-only" disabled={busy !== null} onChange={(e) => upload("crown", e.target.files?.[0])} />
            </label>
            {crownPath && (
              <form action={clearCrownImage} onSubmit={() => setCrownPath(null)}>
                <input type="hidden" name="id" value={brand.id} />
                <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-accent-800 underline underline-offset-2">
                  Remove
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-[13px]">
        <b>Artwork on file</b>
        <span className="text-[12px] opacity-70">{artwork}. Adding a file makes it the current approved artwork (PDF, AI, EPS, JPG, PNG · up to 20 MB).</span>
        <label className="cursor-pointer self-start text-accent underline underline-offset-2">
          {busy === "artwork" ? "Uploading…" : "Add artwork file"}
          <input type="file" accept={ARTWORK_ACCEPT} className="sr-only" disabled={busy !== null} onChange={(e) => upload("artwork", e.target.files?.[0])} />
        </label>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
