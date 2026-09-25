# Peniel Portal — project instructions

Peniel Industry PLC manufactures 26mm crown corks at Bole Lemi Industrial Park, Addis Ababa. This repo is a web app with two sides sharing one codebase and one database:

- **Customer portal**: breweries (e.g. Habesha Brewery S.C.) log in to place orders with a PO attached, track orders, see production and quality for their own orders, approve artwork, and download documents.
- **Staff portal ("Peniel Ops")**: Peniel staff confirm orders, update statuses, enter production and QC data, manage stock, artwork, documents, customers, and messages.

Full specification, data model, and build phases: @docs/PORTAL_SPEC.md
Design reference (screens exported from Claude Design): `design/customer/` and `design/staff/`. Match these screens for layout, colours, and typography.

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Storage, Row Level Security
- Email: Resend (transactional notifications)
- Hosting: Vercel, custom domain `portal.penielindustry.org`
- Timezone `Africa/Addis_Ababa`; dates shown as `14 Oct 2026`; crown quantities shown as `12.0M` / `850K`

## Non-negotiable rules
1. **Tenant isolation.** A customer user belongs to exactly one company and must never be able to read or write another company's data — enforced in the database (RLS / views / RPC), not only in the UI. Every customer-facing query is scoped to the caller's `company_id`.
2. **Customers never see internal equipment detail.** No production line names, machine or press names, OEE, downtime, raw-material levels, spec measurements, SPC data, or internal notes may reach a customer — not in pages, API responses, JSON payloads, or file names. Customers read only through dedicated customer views/functions that exclude those columns.
   - **One exception (agreed with Peniel):** the Certificate of Analysis (form PIC-OF-053) for a batch that is **released and published** shows that batch's results for the CoA's measured parameters. It comes only from `certificate_of_analysis()`, which returns nothing else from the measurements (no press, line, SPC or notes) and nothing for held or unpublished batches.
3. **Customers DO see (for their own orders/batches only):** daily output, completed vs ordered, reject rates, defects by type, released/held batches, finished stock, statuses, and hold/delay reasons.
4. **Two separate text fields** wherever staff explain a problem: `customer_reason` (shown to the customer, plain language) and `internal_notes` (never shown). Staff forms that write `customer_reason` show the warning "Written for the customer: do not include line or machine names" and a live customer preview.
5. **No public sign-up.** Accounts are created by invite from staff only.
6. **Uploads** go to private Storage buckets under `company_id/…`, served via short-lived signed URLs. Allowed: PDF, JPG, PNG, XLSX, DOCX, max 20 MB. Artwork and proofs also accept AI and EPS.
7. Every status change, hold, release, and publish action writes an `audit_log` row (who, what, when, before/after).

## Working style
- Build phase by phase as listed in the spec. At the end of each phase: run the app, run the tests, and summarise what was built and what I need to check.
- Write the RLS/isolation tests first in Phase 1 and keep them passing in every later phase.
- Ask me before adding paid services, changing the stack, or deploying to production.
- Seed data: Habesha Brewery S.C. with brands Habesha, Feta, Kidame, Negus, and one placeholder brand, plus two other brewery customers.
