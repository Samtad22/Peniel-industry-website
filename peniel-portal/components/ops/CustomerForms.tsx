"use client";

import { useActionState } from "react";
import { retireBrand, saveBrand, saveCompany, type CustomerState } from "@/app/ops/customers/actions";
import Modal from "@/components/ui/Modal";
import { Button, Field, FormMessage } from "@/components/ui/form";

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
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="company_id" value={companyId} />
      {brand && <input type="hidden" name="id" value={brand.id} />}
      <Field label="Brand name" htmlFor="br-name">
        <input id="br-name" name="name" required maxLength={100} defaultValue={brand?.name} placeholder="e.g. Negus" className="input min-h-11" autoFocus />
      </Field>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Field label="Size" htmlFor="br-size">
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
      <Field label="Colours (comma-separated)" htmlFor="br-colours">
        <input id="br-colours" name="colours" maxLength={300} defaultValue={brand?.colours.join(", ")} placeholder="e.g. PMS 485 C, #D52B1E, gold" className="input min-h-11" />
      </Field>
      <span className="text-[12px] opacity-70">Customers see the name, size, liner and finish when they order. A #hex colour sets the crown swatch.</span>
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
  );
}
