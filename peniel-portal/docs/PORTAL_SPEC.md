# Peniel Portal — specification

## 1. Users and roles

| Side | Role | Can do |
|---|---|---|
| Customer | `customer_user` | Everything in the customer portal for their own company and all of its brands |
| Staff | `admin` | Everything, including customers, users, settings |
| Staff | `sales` | Order inbox, orders, artwork, documents, customers (view), messages |
| Staff | `production` | Production entry and views, orders (view) |
| Staff | `quality` | QC inspections, release/hold, orders (view) |
| Staff | `warehouse` | Inventory, finished stock, pickups and dispatch |

A company has many brands; a customer user sees all brands of their company.

## 2. Data model (Postgres / Supabase)

Internal-only columns are marked **(internal)**. They must never appear in customer views.

- `companies` — id, name, code, contact details, active
- `brands` — id, company_id, name, crown_image_path, spec (size, liner PVC-free/PVC, finish, colours), current_artwork_version_id, active
- `profiles` — user_id (auth.users), company_id (null for staff), full_name, role, active, last_login_at
- `orders` — id, order_no (`PN-YY-NNNN`, sequential per year), company_id, brand_id, po_number, quantity, requested_date, confirmed_due_date, revised_due_date, delivery_method (pickup/delivery), delivery_address, status, customer_reason, internal_notes **(internal)**, submitted_by, confirmed_by, timestamps
- `order_status_events` — order_id, status, customer_reason, internal_notes **(internal)**, created_by, created_at (drives the customer timeline)
- `order_attachments` — order_id, company_id, file_path, file_name, size, type (purchase_order/specification/other), uploaded_by
- `production_lines` **(internal table)** — id, name
- `production_entries` — id, order_id, entry_date, shift, line_id **(internal)**, produced_qty, reject_qty, entered_by, published (bool)
- `qc_inspections` — id, batch_no, order_id, inspected_at, sample_size, measurements jsonb **(internal)**, reject_pct, result (released/on_hold), customer_reason, internal_notes **(internal)**, published (bool), inspector_id
- `qc_defects` — inspection_id, defect_type, count
- `defect_types` — code, customer_label (e.g. "Print misregister", "Liner voids", "Crown height out of tolerance", "Scratches", "Colour variation")
- `raw_materials` / `raw_material_movements` **(internal)**
- `finished_stock` — id, company_id, brand_id, order_id, batch_no, quantity, location **(internal)**, ready_since, status (available/reserved/on_hold), customer_reason
- `pickup_bookings` — id, company_id, stock ids, requested_at, status (requested/confirmed/rescheduled/collected), proposed_time, vehicle, driver, delivery_note_no
- `artwork_versions` — id, brand_id, version, file_path, approved_at, approved_by
- `proofs` — id, brand_id, order_id (nullable), file_path, status (sent/approved/changes_requested), customer_comment, sent_by, responded_by
- `documents` — id, company_id, brand_id, order_id, type, file_path, visibility (customer/internal), uploaded_by
- `message_threads` / `messages` — company_id, order_id (nullable), assigned_to, author, body, read flags
- `hold_reason_presets` — editable customer-facing phrases for staff to pick from
- `audit_log` — actor, action, entity, entity_id, before jsonb, after jsonb, created_at

### Customer access layer
Customers get **no direct SELECT** on the tables above. They read through views or RPC functions that (a) filter to the caller's `company_id` and (b) select only customer-safe columns:

- `customer_orders`, `customer_order_timeline`, `customer_order_attachments`
- `customer_daily_output` — aggregated from published `production_entries` by order and date (sum produced, sum rejects, reject %); no line or shift
- `customer_quality_batches`, `customer_defects_by_type` — from published inspections only; no measurements
- `customer_finished_stock` — no location
- `customer_proofs`, `customer_artwork`, `customer_documents` (visibility = customer only)

Customer writes are limited to: create order (status `submitted`), upload attachments to own orders, approve/request changes on own proofs, book pickups, send messages.

## 3. Order statuses
`submitted → confirmed → awaiting_approval → scheduled → in_production → quality_check → ready_for_pickup / dispatched → delivered`, plus `on_hold` from any active state. `on_hold` and any due-date change require `customer_reason`.

## 4. Notifications (email)
- To customer: order confirmed, proof awaiting approval, order on hold / date revised (with reason), ready for pickup, dispatched, new document shared, new message.
- To staff: new order submitted, proof approved / changes requested, pickup requested, new customer message.

## 5. Build phases

**Phase 1 — Foundation**
Project setup, Supabase schema and migrations, RLS policies, customer views, seed data, invite-only auth (staff invites user → user sets password), role-based layouts for both sides.
Done when: the isolation tests pass — a Habesha user cannot fetch another company's order by ID, via any view, or via a direct API call; no customer response contains `line_id`, `measurements`, `internal_notes`, or `location`.

**Phase 2 — Orders**
Customer: Orders home (KPIs, brand cards, table, detail panel, timeline), Products (brand tiles), New order stepper with PO upload, "Order another brand on this PO".
Staff: Order inbox with PO preview, confirm / clarify / reject, order detail with status control, customer-reason preview, internal notes, audit log.

**Phase 3 — Production and quality**
Staff: tablet-friendly production entry, internal production dashboard, QC inspection form, release/hold, publish toggles.
Customer: Production tab — Output, Quality, Stock sub-tabs with "Last updated by Peniel".

**Phase 4 — Inventory, artwork, documents, messages**
Finished stock and pickup bookings, dispatch recording, proof queue and approvals, document library with visibility, message threads.

**Phase 5 — Notifications and launch**
Email notifications, empty/error states, mobile layouts, "Preview as customer" for staff, deployment to Vercel with `portal.penielindustry.org`, production Supabase project, backups enabled.
