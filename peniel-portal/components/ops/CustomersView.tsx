import Link from "next/link";
import Crown, { crownSrc, InkSwatches } from "@/components/ui/Crown";
import { BrandDialog, CompanyDialog, type BrandFields, type CompanyFields } from "./CustomerForms";
import CrownImport from "./CrownImport";
import InviteDialog from "./InviteDialog";
import UsersTable, { type UserRow } from "./UsersTable";
import { OpsTopBar } from "@/components/ops/OpsHeader";
import { SectionHead } from "@/components/ops/OpsKit";

export type CompanyListItem = { id: string; name: string; brands: number; users: number; openOrders: number };
export type BrandCard = {
  id: string;
  name: string;
  spec: string;
  artwork: string;
  fields: BrandFields;
};
export type CompanyDetail = {
  id: string;
  name: string;
  code: string;
  since: string;
  address: string | null;
  email: string | null;
  openOrders: number;
  brands: BrandCard[];
  users: UserRow[];
  fields: CompanyFields;
};

/** Customers — design screen 1o: company list and one company's page. */
export default function CustomersView({
  companies,
  selected,
  canInvite,
  canEditBrands,
  meId,
}: {
  companies: CompanyListItem[];
  selected: CompanyDetail | null;
  /** Admin: add/edit customers and invite their users. */
  canInvite: boolean;
  /** Admin and Sales: add and edit brands. */
  canEditBrands: boolean;
  meId: string;
}) {
  return (
    <>
      <OpsTopBar />
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="border-b-2 border-divider lg:border-b-0 lg:border-r-2">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-text px-6 pb-[18px] pt-[22px]">
          <div>
            <h1 className="m-0 text-[44px] leading-[.95] tracking-[-.04em]">Customers</h1>
            <div className="mt-1.5 text-[13px] opacity-70">
              {companies.length} compan{companies.length === 1 ? "y" : "ies"} · {companies.reduce((t, c) => t + c.openOrders, 0)} open orders
            </div>
          </div>
          {canInvite && <CompanyDialog triggerLabel="+ New customer" />}
        </div>
        <div className="max-lg:flex max-lg:overflow-x-auto">
          {companies.map((c) => {
            const on = c.id === selected?.id;
            return (
              <Link
                key={c.id}
                href={`/ops/customers?c=${c.id}`}
                aria-current={on ? "page" : undefined}
                className={
                  "flex shrink-0 flex-col gap-1 border-b-2 border-divider px-6 py-4 text-[14px] no-underline max-lg:border-r-2 " +
                  (on ? "bg-text text-bg hover:text-bg" : "text-text hover:bg-text/5 hover:text-text")
                }
              >
                <b className="text-[15px]">{c.name}</b>
                <span className="text-[12px] opacity-75">
                  {c.brands} brand{c.brands === 1 ? "" : "s"} · {c.users} user{c.users === 1 ? "" : "s"} ·{" "}
                  {c.openOrders} open order{c.openOrders === 1 ? "" : "s"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-3 border-b-2 border-divider px-4 pb-6 pt-[22px] sm:px-8">
            <div className="min-w-0 flex-[1_1_260px]">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-accent-700">
                Customer since {selected.since} · ID {selected.code}
              </span>
              <h2 className="mb-1 mt-1.5 text-[32px] leading-[1] tracking-[-.03em] sm:text-[48px]">{selected.name}</h2>
              <div className="text-[13px] opacity-70">
                {[selected.address, selected.email, `${selected.openOrders} open orders`].filter(Boolean).join(" · ")}
              </div>
            </div>
            {canInvite && <CompanyDialog company={selected.fields} triggerLabel="Edit details" variant="secondary" />}
            {canInvite && (
              <InviteDialog mode="customer" company={{ id: selected.id, name: selected.name }} triggerLabel="+ Invite user" />
            )}
          </div>

          <div className="border-b-2 border-divider px-4 py-6 sm:px-8">
            <SectionHead title="Brands" aside={`${selected.brands.length} brand${selected.brands.length === 1 ? "" : "s"}`}>
              {canEditBrands && (
                <div className="flex flex-wrap items-center gap-2">
                  {selected.brands.length > 0 && (
                    <CrownImport companyId={selected.id} companyName={selected.name} brands={selected.brands.map((b) => ({ id: b.id, name: b.name }))} />
                  )}
                  <BrandDialog companyId={selected.id} triggerLabel="+ Add brand" variant="secondary" />
                </div>
              )}
            </SectionHead>
            <div className="overflow-hidden">
              <div className="-ml-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                {selected.brands.map((b) => (
                  <div key={b.id} className="flex flex-col gap-1 border-l border-divider p-3.5 text-[13px]">
                    <span className="mb-1">
                      <Crown colours={b.fields.colours} src={crownSrc(b.fields)} size={56} alt={`${b.name} crown`} />
                    </span>
                    <b>{b.name}</b>
                    <span className="text-[12px] opacity-70">{b.spec}</span>
                    <span className="text-[12px]">
                      <InkSwatches colours={b.fields.colours} compact />
                    </span>
                    <span className="text-[12px]">{b.artwork}</span>
                    {canEditBrands && <BrandDialog companyId={selected.id} brand={b.fields} triggerLabel="Edit" variant="link" />}
                  </div>
                ))}
              </div>
            </div>
            {selected.brands.length === 0 && (
              <p className="m-0 pt-3 text-[13px] opacity-60">
                No brands yet. Add at least one: customers choose a brand when they place an order.
              </p>
            )}
          </div>

          <div className="px-4 pb-8 pt-6 sm:px-8">
            <div className="mb-2">
              <SectionHead title="Users" aside="No public sign-up. Users join by invite only." />
            </div>
            <UsersTable users={selected.users} canManage={canInvite} meId={meId} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 p-8">
          <p className="m-0 opacity-70">No customer companies yet.</p>
          {canInvite ? (
            <>
              <p className="m-0 max-w-[520px] text-[14px] opacity-70">
                Add a customer, then its brands, then invite the people who will order. They get an email to set a password.
              </p>
              <CompanyDialog triggerLabel="+ New customer" />
            </>
          ) : (
            <p className="m-0 text-[14px] opacity-70">An admin adds customer companies.</p>
          )}
        </div>
      )}
    </div>
    </>
  );
}
