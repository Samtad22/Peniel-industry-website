"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  askCustomer,
  confirmOrder,
  rejectOrder,
  replyToCustomer,
  saveInternalNotes,
  setOrderStatus,
  type OrderActionState,
} from "@/app/ops/orders/actions";
import StatusBadge, { Pill } from "@/components/ui/StatusBadge";
import { CustomerSees, InternalOnly } from "@/components/ui/Visibility";
import { Button, FormMessage } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_PILL, type OrderStatus } from "@/lib/order-status";

export type Preset = { id: string; text: string };

/** CLAUDE.md rule 4: shown on every staff form that writes customer_reason. */
export function CustomerWarning({ boxed }: { boxed?: boolean }) {
  return (
    <div
      className={clsx(
        "text-[13px] font-extrabold text-accent-800",
        boxed && "border-2 border-accent px-3 py-2.5",
      )}
    >
      ⚠ Written for the customer: do not include line or machine names.
    </div>
  );
}

function Modal({
  trigger,
  title,
  children,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const id = `dlg-${title.replace(/\W+/g, "-")}`;
  return (
    <>
      {trigger(() => setOpen(true))}
      {open && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dialog !w-[min(520px,100%)]" role="dialog" aria-modal="true" aria-labelledby={id}>
            <div id={id} className="dialog-title">
              {title}
            </div>
            {children(() => setOpen(false))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * "Confirm order" block of the inbox (design 1c). `children` (the clarify and
 * reject buttons) sit beside the Confirm button but outside this form, since
 * their dialogs hold forms of their own.
 */
export function ConfirmForm({
  orderId,
  defaultDue,
  minDate,
  children,
}: {
  orderId: string;
  defaultDue: string;
  minDate: string;
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(confirmOrder, null);
  const formId = `confirm-${orderId}`;
  return (
    <div className="flex flex-col gap-3">
      <form id={formId} action={action} className="flex flex-col gap-3">
        <input type="hidden" name="order_id" value={orderId} />
        <div className="field max-w-[260px]">
          <label htmlFor={`due-${orderId}`} className="!flex justify-between gap-2">
            Due date
            <CustomerSees />
          </label>
          <input
            id={`due-${orderId}`}
            name="due_date"
            type="date"
            required
            min={minDate}
            defaultValue={defaultDue >= minDate ? defaultDue : ""}
            className="input min-h-10"
          />
        </div>
        <FormMessage state={state} />
      </form>
      <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
        <Button type="submit" form={formId} disabled={pending} icon="✓" className="px-3.5 py-3 sm:col-span-2">
          {pending ? "Confirming…" : "Confirm order"}
        </Button>
        {children}
      </div>
    </div>
  );
}

/** "Reject order" dialog (design 1d). */
export function RejectDialog({
  orderId,
  title,
  summary,
  presets,
}: {
  orderId: string;
  title: string;
  summary: string;
  presets: Preset[];
}) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(rejectOrder, null);
  const [text, setText] = useState("");
  return (
    <Modal
      title={title}
      trigger={(open) => (
        <button type="button" onClick={open} className="btn btn-secondary btn-split px-3.5 py-3 text-accent-700 hover:text-accent-700">
          Reject<span aria-hidden="true">×</span>
        </button>
      )}
    >
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="order_id" value={orderId} />
          <div className="dialog-body">{summary} The customer sees the order as Rejected, with your message.</div>
          {presets.length > 0 && (
            <div className="field">
              <label htmlFor={`rp-${orderId}`}>Reason preset</label>
              <select
                id={`rp-${orderId}`}
                className="input"
                defaultValue=""
                onChange={(e) => e.target.value && setText(e.target.value)}
              >
                <option value="">Choose a preset, or write your own</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.text}>
                    {p.text}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor={`rr-${orderId}`} className="!flex justify-between gap-2">
              Message to customer (required)
              <CustomerSees />
            </label>
            <textarea
              id={`rr-${orderId}`}
              name="customer_reason"
              required
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="input"
            />
          </div>
          <CustomerWarning />
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              {state?.ok ? "Done" : "Cancel"}
            </Button>
            {!state?.ok && (
              <Button type="submit" disabled={pending || !text.trim()} icon="×" className="w-[170px]">
                {pending ? "Rejecting…" : "Reject order"}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

/** "Request clarification": a question the customer answers on their order page. */
export function AskDialog({ orderId, orderNo }: { orderId: string; orderNo: string }) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(askCustomer, null);
  return (
    <Modal
      title={`Ask about ${orderNo}`}
      trigger={(open) => (
        <button type="button" onClick={open} className="btn btn-secondary btn-split px-3.5 py-3 text-text">
          Request clarification<span aria-hidden="true">?</span>
        </button>
      )}
    >
      {(close) => (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="order_id" value={orderId} />
          <div className="dialog-body">
            The order stays in the inbox. The customer sees your question on the order and can reply there.
          </div>
          <div className="field">
            <label htmlFor={`ask-${orderId}`} className="!flex justify-between gap-2">
              Question for the customer
              <CustomerSees />
            </label>
            <textarea
              id={`ask-${orderId}`}
              name="body"
              required
              maxLength={4000}
              placeholder="e.g. Your PO says delivery on 15 Nov but the order says 20 Nov. Which date is right?"
              className="input"
            />
          </div>
          <CustomerWarning />
          <FormMessage state={state} />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={close}>
              {state?.ok ? "Done" : "Cancel"}
            </Button>
            {!state?.ok && (
              <Button type="submit" disabled={pending} icon="→" className="w-[170px]">
                {pending ? "Sending…" : "Send question"}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

/** What the customer will see on their order page, updated as staff type. */
export function CustomerPreview({
  orderNo,
  status,
  reason,
  due,
  was,
}: {
  orderNo: string;
  status: OrderStatus;
  reason: string;
  due: string | null;
  was: string | null;
}) {
  const dateLine = due && due !== was ? `New due date ${formatDate(due)}${was ? ` (was ${formatDate(was)})` : ""}` : null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.08em] opacity-60">Customer preview · as shown on their order page</span>
      <div className="flex flex-col gap-2 border border-divider bg-bg p-3">
        <span>
          <StatusBadge status={status} audience="customer" />
        </span>
        {status === "on_hold" ? (
          <div className="flex flex-col gap-1.5 bg-accent-800 px-4 py-3.5 text-bg">
            <span className="flex justify-between gap-3 text-[12px]">
              <b>❚❚ ON HOLD · {orderNo}</b>
              <span>Updated {formatDate(new Date())}</span>
            </span>
            <span className="text-[15px]">{reason || "Your reason appears here."}</span>
            {dateLine && <span className="text-[12px] opacity-85">{dateLine}</span>}
          </div>
        ) : status === "rejected" ? (
          <div className="flex flex-col gap-1.5 border-2 border-accent-800 px-4 py-3.5 text-accent-800">
            <b className="text-[12px]">× NOT ACCEPTED · {orderNo}</b>
            <span className="text-[15px]">{reason || "Your reason appears here."}</span>
          </div>
        ) : reason || dateLine ? (
          <div className="flex flex-col gap-1 bg-accent-100 px-4 py-3 text-accent-800">
            <b className="text-[12px]">UPDATE FROM PENIEL · {formatDate(new Date())}</b>
            {reason && <span className="text-[14px]">{reason}</span>}
            {dateLine && <span className="text-[12px]">{dateLine}</span>}
          </div>
        ) : (
          <span className="text-[13px] opacity-60">No message. The customer sees the new status only.</span>
        )}
      </div>
    </div>
  );
}

export type StockForPickup = { quantity: number; batches: string[]; suggestedQty: number; suggestedBatch: string };

/** The status grid and change form of the order page (design 1f). */
export function StatusControl({
  orderId,
  orderNo,
  status,
  due,
  holdPresets,
  rejectPresets,
  minDate,
  stock,
}: {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  due: string | null;
  holdPresets: Preset[];
  rejectPresets: Preset[];
  minDate: string;
  /** This order's crowns in stock now, and what to suggest when it becomes Ready for pickup. */
  stock: StockForPickup;
}) {
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [newDue, setNewDue] = useState(due ?? "");
  const [addStock, setAddStock] = useState(stock.quantity === 0);
  const [state, action, pending] = useActionState<OrderActionState, FormData>(async (prev, fd) => {
    const res = await setOrderStatus(prev, fd);
    if (res?.ok) {
      setTarget(null);
      setReason("");
    }
    return res;
  }, null);

  const allowed = (s: OrderStatus) =>
    s !== "submitted" && status !== "rejected" && (s !== "rejected" || status === "confirmed");
  const dateChanged = Boolean(newDue) && newDue !== (due ?? "");
  const needsReason = target === "on_hold" || target === "rejected" || dateChanged;
  const presets = target === "rejected" ? rejectPresets : holdPresets;
  const pick = (s: OrderStatus) => {
    setTarget(s);
    setReason("");
    setNewDue(due ?? "");
    setAddStock(stock.quantity === 0);
  };
  const stockStep = target === "ready_for_pickup" && addStock;

  if (status === "submitted") {
    return (
      <p className="m-0 bg-neutral-200 px-3.5 py-3 text-[13px]">
        New order: confirm it with a due date, or reject it, in the <a href={`/ops/inbox?o=${orderId}`}>Order inbox</a>.
      </p>
    );
  }
  if (status === "rejected") {
    return <p className="m-0 bg-neutral-200 px-3.5 py-3 text-[13px]">This order was rejected. The customer can submit it again.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "ready_for_pickup" && stock.quantity === 0 && !target && (
        <p className="m-0 bg-accent-100 px-3.5 py-3 text-[13px] text-accent-800">
          <b>Nothing of this order is in stock yet</b>, so the customer can&apos;t book a pickup. Choose <b>Ready for pickup</b> below
          and add the crowns to stock.
        </p>
      )}
      <div className="grid grid-cols-2 border border-divider sm:grid-cols-4 xl:grid-cols-5">
        {ORDER_STATUSES.map((s) => {
          const current = s === status;
          const chosen = s === target;
          const ok = allowed(s);
          return (
            <button
              key={s}
              type="button"
              disabled={!ok}
              onClick={() => pick(s)}
              aria-pressed={chosen}
              title={current ? "Current status: choose it to change the due date or send an update" : undefined}
              className={clsx(
                "flex min-h-12 flex-col items-start gap-1 border-b border-r border-divider p-2.5 text-left",
                ok ? "cursor-pointer hover:bg-text/5" : "cursor-not-allowed opacity-35",
                chosen && "bg-accent-100 shadow-[inset_0_0_0_2px_var(--color-accent-800)]",
                !chosen && "bg-transparent",
              )}
            >
              <Pill style={ORDER_STATUS_PILL[s]}>{ORDER_STATUS_LABELS[s]}</Pill>
              {current && <span className="text-[10px] font-extrabold uppercase tracking-[0.08em]">Now</span>}
            </button>
          );
        })}
      </div>

      {target && (
        <form action={action} className="flex flex-col border-2 border-text">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="status" value={target} />
          <div className="flex flex-wrap justify-between gap-2 bg-text px-3.5 py-2.5 text-[13px] text-bg">
            <b>
              {target === status
                ? `${ORDER_STATUS_LABELS[status]} · update due date or message`
                : `${ORDER_STATUS_LABELS[status]} → ${ORDER_STATUS_LABELS[target]}`}
              {needsReason && " · reason required"}
            </b>
            {dateChanged && <span>Due date changed as well</span>}
          </div>
          <div className="grid gap-3.5 p-4 sm:grid-cols-2">
            {(target === "on_hold" || target === "rejected" || dateChanged) && presets.length > 0 ? (
              <div className="field">
                <label htmlFor={`sp-${orderId}`}>Reason preset</label>
                <select
                  id={`sp-${orderId}`}
                  className="input"
                  defaultValue=""
                  onChange={(e) => e.target.value && setReason(e.target.value)}
                >
                  <option value="">Choose a preset, or write your own</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.text}>
                      {p.text}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="max-sm:hidden" />
            )}
            {target !== "rejected" && (
              <div className="field">
                <label htmlFor={`nd-${orderId}`} className="!flex justify-between gap-2">
                  New due date
                  {due && <span className="text-[11px] opacity-70">was {formatDate(due)}</span>}
                </label>
                <input
                  id={`nd-${orderId}`}
                  name="due_date"
                  type="date"
                  min={minDate}
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="input"
                />
              </div>
            )}
            <div className="field sm:col-span-2">
              <label htmlFor={`cr-${orderId}`} className="!flex justify-between gap-2">
                Customer-facing reason{needsReason ? "" : " (optional)"}
                <CustomerSees />
              </label>
              <textarea
                id={`cr-${orderId}`}
                name="customer_reason"
                maxLength={1000}
                required={needsReason}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input !min-h-[70px]"
              />
            </div>
            <div className="sm:col-span-2">
              <CustomerWarning boxed />
            </div>
            {target === "ready_for_pickup" && (
              <fieldset className="m-0 flex flex-col gap-3 border border-divider p-3.5 sm:col-span-2">
                <legend className="px-1 text-[13px] font-bold">Crowns for pickup</legend>
                {stock.quantity > 0 && (
                  <p className="m-0 text-[13px]">
                    {stock.quantity.toLocaleString("en-US")} crowns of this order are in stock (batch {stock.batches.join(", ")}). The customer can book a
                    pickup for them.
                  </p>
                )}
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="add_stock" checked={addStock} onChange={(e) => setAddStock(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                  {stock.quantity > 0 ? "Add more crowns to stock" : "Put the crowns into stock so the customer can book a pickup"}
                </label>
                {addStock && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="field">
                      <label htmlFor={`sb-${orderId}`}>Batch number</label>
                      <input id={`sb-${orderId}`} name="stock_batch" required maxLength={40} defaultValue={stock.suggestedBatch} className="input" />
                    </div>
                    <div className="field">
                      <label htmlFor={`sq-${orderId}`}>Quantity (crowns)</label>
                      <input
                        id={`sq-${orderId}`}
                        name="stock_quantity"
                        required
                        inputMode="numeric"
                        defaultValue={stock.suggestedQty ? String(stock.suggestedQty) : ""}
                        className="input"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`sl-${orderId}`} className="!flex justify-between gap-2">
                        Location <InternalOnly />
                      </label>
                      <input id={`sl-${orderId}`} name="stock_location" maxLength={100} placeholder="e.g. Bay 2" className="input" />
                    </div>
                  </div>
                )}
                <span className="text-[12px] opacity-70">
                  The customer sees the batch and quantity under Production → Stock, never the location. The warehouse can adjust it in Inventory.
                </span>
              </fieldset>
            )}
          </div>
          <div className="px-4 pb-4">
            <CustomerPreview orderNo={orderNo} status={target} reason={reason.trim()} due={newDue || null} was={due} />
          </div>
          {state?.error && (
            <div className="px-4 pb-3">
              <FormMessage state={state} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-divider px-4 py-3">
            <span className="text-[12px] opacity-70">
              The customer sees this in the portal and gets an email when the order is confirmed, on hold, ready, dispatched or its date changes.
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || (needsReason && !reason.trim()) || (target === status && !dateChanged && !reason.trim() && !stockStep)}
                icon={target === "on_hold" ? "❚❚" : "→"}
                className="w-[200px]"
              >
                {pending
                  ? "Saving…"
                  : target === status
                    ? stockStep && !dateChanged && !reason.trim()
                      ? "Add to stock"
                      : "Save update"
                    : target === "on_hold"
                      ? "Set on hold"
                      : `Set ${ORDER_STATUS_LABELS[target].toLowerCase()}`}
              </Button>
            </div>
          </div>
        </form>
      )}
      {!target && state?.ok && <FormMessage state={state} />}
    </div>
  );
}

export function NotesForm({ orderId, notes, canEdit }: { orderId: string; notes: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(saveInternalNotes, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <label htmlFor={`notes-${orderId}`} className="sr-only">
        Internal notes
      </label>
      <textarea
        id={`notes-${orderId}`}
        name="internal_notes"
        defaultValue={notes}
        readOnly={!canEdit}
        maxLength={4000}
        placeholder={canEdit ? "Material, scheduling, anything the team should know." : "No internal notes."}
        className="input !min-h-24 !bg-bg"
      />
      <FormMessage state={state} />
      {canEdit && (
        <Button type="submit" variant="secondary" disabled={pending} className="self-end">
          {pending ? "Saving…" : "Save notes"}
        </Button>
      )}
    </form>
  );
}

export function StaffReplyForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(replyToCustomer, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <label htmlFor={`sr-${orderId}`} className="!flex justify-between gap-2 text-[12px] opacity-80">
        Message the customer
        <CustomerSees />
      </label>
      <textarea id={`sr-${orderId}`} name="body" required maxLength={4000} className="input !min-h-[70px] !bg-bg" />
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} icon="→" className="w-[140px] self-end">
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
