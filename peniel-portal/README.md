# Peniel Portal

The customer portal and the staff "Peniel Ops" portal for Peniel Industry PLC:
one Next.js app, one Supabase database. The rules are in [CLAUDE.md](CLAUDE.md)
and the full specification is in [docs/PORTAL_SPEC.md](docs/PORTAL_SPEC.md).

The marketing site in `../peniel-industry/` is a separate app and is unchanged.

## Status: Phase 5 (Notifications and launch)

All five phases are built. Going live is a checklist of dashboard steps,
some of which need a decision first: see [docs/LAUNCH.md](docs/LAUNCH.md).

| Area | Where |
|---|---|
| Database schema (every table in the spec) | `supabase/migrations/…01_schema.sql` |
| Order numbers `PN-YY-NNNN`, reason rules, timeline, audit log | `supabase/migrations/…02_functions_triggers.sql` |
| Row Level Security (staff by role, customers get nothing directly) | `supabase/migrations/…03_rls.sql` |
| Customer views and customer write functions | `supabase/migrations/…04_customer_access.sql` |
| Private file buckets (`company_id/…`, 20 MB, PDF/JPG/PNG/XLSX/DOCX) | `supabase/migrations/…05_storage.sql` |
| Orders: submit with PO, status rules, reject reasons, order audit for staff | `supabase/migrations/20260924000001_orders.sql` |
| Production & QC: publish stamps, frozen published entries, `qc_save_inspection` | `supabase/migrations/20260925000001_production_quality.sql` |
| Internal message notes, documents, proof versions, stock collection, raw material movements | `supabase/migrations/20260926000001_inventory_artwork_documents_messages.sql` |
| Email log for notifications (admin-only) | `supabase/migrations/20260927000001_notifications.sql` |
| Files on messages (customers never see files on internal notes) | `supabase/migrations/20260928000001_message_attachments.sql` |
| Seed data (Habesha + 2 other breweries) | `supabase/seed.sql` |
| Sign-in, invite, set password, forgot password | `app/login`, `app/auth`, `app/forgot-password` |
| Customer: Orders, New order, Catalog, Production (Output / Quality / Stock + pickup booking), Artwork (proof approval), Documents, Messages | `app/(customer)` |
| Staff: Dashboard, Order inbox, Orders, Production, Quality control, Inventory + Pickups, Artwork, Documents, Customers, Messages, Settings | `app/ops` |
| Tablet production entry for the floor | `app/production-entry` |
| File downloads (checked, then a 60-second signed URL) | `app/files/{attachments,documents,proofs,artwork,messages}/[id]` |
| Notification emails (Resend; off until keys are set, see Ops → Settings) | `lib/notify.ts`, `lib/email.ts` |
| Staff "Preview as customer" for an order | `app/ops/orders/[id]/preview` |
| Isolation and rules tests | `tests/db` |

Ops → Maintenance is in the design but not in the spec, so it shows a "Planned" placeholder.

### How an order with its PO is placed

The browser uploads each file straight to Storage, into
`order-attachments/{company_id}/uploads/…` (Storage policies allow a customer
nowhere else). On submit, one database call, `customer_submit_order`, checks
every file is really in that company's folder, requires a purchase order, and
creates the order and its attachments together. A failed upload therefore never
leaves an order without its PO. "Order another brand on this PO" reuses the
same PO file on the new order.

## How the data is protected

- **Customers never query tables.** They have no Row Level Security policy on
  any table, so a direct query returns nothing. The only exception is their own
  profile row. They read through `customer_*` views. Each view filters to the
  caller's company and leaves out internal columns such as line, shift,
  measurements, internal notes and location.
- **Customer writes** go through `customer_create_order`,
  `customer_add_order_attachment`, `customer_respond_to_proof`,
  `customer_request_pickup` and `customer_send_message`. Each one checks
  ownership and sets only the fields a customer may set.
- **Staff** read everything and write by role (admin, sales, production,
  quality, warehouse), as the spec's role table sets out.
- **Holds and due-date changes** are refused by the database without a
  `customer_reason`.
- **Every change** to orders, QC, production, stock, proofs, documents and
  users goes into `audit_log`, with who made it and the before and after values.

The customer views run with the view owner's rights. That is on purpose: it
lets them read past RLS and apply the company filter themselves. Supabase's
database linter will flag them as "security definer views". This is expected.

## Running it on your computer

You need Node.js 22+.

```bash
cd peniel-portal
npm install
cp .env.example .env.local   # then fill in the values, see below
npm run dev                  # http://localhost:3000
```

## Tests

```bash
npm test            # everything
npm run test:unit   # date / quantity formats, redirect safety
npm run test:db     # isolation tests against a temporary local Postgres
```

`test:db` needs Postgres 15 or newer installed locally, because it starts a
throwaway database. It applies the real migrations and seed, then runs every
query the way the Supabase API does: as the `authenticated` role, with the
user's login token set. The tests go through **every** `customer_*` view and
**every** table automatically. When new views are added in later phases, they
are tested without editing the tests.

## Setting up Supabase (one time)

1. Create a project at [supabase.com](https://supabase.com). The free plan is
   enough to start. Choose a region close to Ethiopia, such as Frankfurt
   (`eu-central-1`).
2. **Apply the database.** Install the Supabase CLI (`npx supabase --help`), then:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push          # runs supabase/migrations
   ```
   To load the sample data, open **SQL Editor** in the dashboard, paste in
   `supabase/seed.sql` and run it. **Only do this on a test project.**
3. **Auth settings** (Dashboard → Authentication):
   - *Sign In / Providers → Email*: turn **off** "Allow new users to sign up".
   - *URL Configuration*: set **Site URL** to `http://localhost:3000` for
     now. Later it becomes `https://portal.penielindustry.org`. Add
     `http://localhost:3000/auth/confirm` to Redirect URLs.
   - *Emails → Templates*: paste `supabase/templates/invite.html` into
     "Invite user" and `supabase/templates/recovery.html` into "Reset password".
     The invite and reset links will not work without this step.
4. **Keys** (Dashboard → Project Settings → API). Put these in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the `anon` / publishable key
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` / secret key. This key
     is **secret**. Never commit it or share it.
5. **Create the first admin:**
   ```bash
   npm run create-admin -- you@penielindustry.org "Your Name"
   ```
   Open the email, choose a password, then invite everyone else from
   **Ops → Users**.

Supabase's built-in email sender only sends a few emails per hour. That is fine
for testing. For real invites, connect Resend under Authentication → Emails →
SMTP Settings. Resend also sends the notification emails: set
`RESEND_API_KEY` and `EMAIL_FROM` in `.env.local` to turn them on. Without
them, emails are logged as "skipped" on Ops → Settings and nothing else changes.

## Design reference

`CLAUDE.md` says the Claude Design exports belong in `design/customer/` and
`design/staff/`. They are not in the repo yet. Until they are added, the
screens use the marketing site's brand colours and fonts.
