-- ============================================================================
-- Development seed data
--
-- Business data only — no user accounts. Create the first admin with
-- `npm run create-admin` (see README), then invite everyone else from the app.
--
-- Internal fields deliberately mention line and press names ("Line 2",
-- "Press B", "bay") so the isolation tests can prove none of it reaches a
-- customer.
-- ============================================================================

-- Companies ------------------------------------------------------------------
insert into public.companies (id, name, code, contact_name, contact_email, contact_phone, address) values
  ('11111111-1111-4111-8111-111111111111', 'Habesha Brewery S.C.', 'HAB', 'Procurement', 'procurement@habesha.example', '+251 11 000 0001', 'Debre Birhan, Ethiopia'),
  ('22222222-2222-4222-8222-222222222222', 'Dashen Brewery S.C.',  'DSH', 'Procurement', 'procurement@dashen.example',  '+251 11 000 0002', 'Gondar, Ethiopia'),
  ('33333333-3333-4333-8333-333333333333', 'BGI Ethiopia',         'BGI', 'Procurement', 'procurement@bgi.example',     '+251 11 000 0003', 'Addis Ababa, Ethiopia');

-- Brands ---------------------------------------------------------------------
insert into public.brands (id, company_id, name, liner, finish) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Habesha', 'PVC-free', 'Gloss'),
  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Feta',    'PVC-free', 'Gloss'),
  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Kidame',  'PVC-free', 'Matte'),
  ('a1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Negus',   'PVC-free', 'Gloss'),
  ('a1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'New brand (placeholder)', 'PVC-free', null),
  ('a2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Dashen',    'PVC-free', 'Gloss'),
  ('a3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'St. George', 'PVC',     'Gloss');

-- Reference data -------------------------------------------------------------
-- The design's placeholder defect types, retired by the CoA migration; the
-- sample inspections below still use them. Current types: the CoA checks.
insert into public.defect_types (code, customer_label, active) values
  ('print_misregister', 'Print misregister', false),
  ('liner_voids',       'Liner voids', false),
  ('height_oot',        'Crown height out of tolerance', false),
  ('scratches',         'Scratches', false),
  ('colour_variation',  'Colour variation', false)
on conflict (code) do nothing;

insert into public.hold_reason_presets (text, sort_order) values
  ('Waiting for your approval of the updated artwork.', 1),
  ('Waiting for clarification on the purchase order.', 2),
  ('Raw material delivery delayed. We will confirm a new date shortly.', 3),
  ('Batch under re-inspection by our quality team.', 4),
  ('Production rescheduled. See the revised due date.', 5);

insert into public.production_lines (id, name) values
  ('b0000000-0000-4000-8000-000000000001', 'Line 1 · Press A'),
  ('b0000000-0000-4000-8000-000000000002', 'Line 2 · Press B');

insert into public.raw_materials (name, unit, on_hand, reorder_level) values
  ('Tinplate sheet 0.23 mm',   'sheets', 180000, 50000),
  ('PVC-free liner compound',  'kg',       4200,   1500),
  ('Printing ink',             'kg',        310,    100),
  ('Lacquer',                  'L',         520,    200);

-- Orders ---------------------------------------------------------------------
-- Inserted as `submitted`, then moved along so each gets a realistic timeline.
insert into public.orders (id, company_id, brand_id, po_number, quantity, requested_date, delivery_method, internal_notes) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000001', 'HB-PO-2026-118', 12000000, '2026-10-14', 'pickup',   'Running on Line 2 / Press B. OEE 81% this week.'),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000002', 'HB-PO-2026-118',   850000, '2026-10-20', 'pickup',   'Press B die change pending, downtime 6h.'),
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000003', 'HB-PO-2026-121',  5000000, '2026-11-02', 'delivery', null),
  ('c1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000004', 'HB-PO-2026-097',  3000000, '2026-09-18', 'pickup',   'Line 1 finished early.'),
  ('c2000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'a2000000-0000-4000-8000-000000000001', 'DB-7781',          6000000, '2026-10-10', 'delivery', 'Dashen priority: Line 1 / Press A.'),
  ('c3000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'a3000000-0000-4000-8000-000000000001', 'BGI-4410',         2500000, '2026-11-15', 'pickup',   null);

update public.orders set delivery_address = 'Habesha Brewery, Debre Birhan' where id = 'c1000000-0000-4000-8000-000000000003';
update public.orders set delivery_address = 'Dashen Brewery, Gondar'        where id = 'c2000000-0000-4000-8000-000000000001';

-- confirm with a due date
update public.orders set status = 'confirmed', confirmed_due_date = requested_date, confirmed_at = now()
where id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002',
             'c1000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000001');

update public.orders set status = 'scheduled'
where id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002',
             'c1000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000001');

update public.orders set status = 'in_production'
where id in ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000004',
             'c2000000-0000-4000-8000-000000000001');

-- Feta goes on hold, with a customer-facing reason and a date change
update public.orders
set status = 'on_hold',
    revised_due_date = '2026-10-27',
    customer_reason = 'Waiting for your approval of the updated Feta artwork.'
where id = 'c1000000-0000-4000-8000-000000000002';

update public.orders set status = 'quality_check'    where id = 'c1000000-0000-4000-8000-000000000004';
update public.orders set status = 'ready_for_pickup' where id = 'c1000000-0000-4000-8000-000000000004';

-- Production entries ---------------------------------------------------------
insert into public.production_entries (order_id, entry_date, shift, line_id, produced_qty, reject_qty, published) values
  ('c1000000-0000-4000-8000-000000000001', '2026-09-20', 'A', 'b0000000-0000-4000-8000-000000000002', 1450000, 8700, true),
  ('c1000000-0000-4000-8000-000000000001', '2026-09-20', 'B', 'b0000000-0000-4000-8000-000000000002', 1380000, 9100, true),
  ('c1000000-0000-4000-8000-000000000001', '2026-09-21', 'A', 'b0000000-0000-4000-8000-000000000002', 1510000, 7600, true),
  ('c1000000-0000-4000-8000-000000000001', '2026-09-22', 'A', 'b0000000-0000-4000-8000-000000000002', 1490000, 6900, false),
  ('c1000000-0000-4000-8000-000000000004', '2026-09-10', 'A', 'b0000000-0000-4000-8000-000000000001', 1520000, 6100, true),
  ('c1000000-0000-4000-8000-000000000004', '2026-09-11', 'A', 'b0000000-0000-4000-8000-000000000001', 1500000, 5800, true),
  ('c2000000-0000-4000-8000-000000000001', '2026-09-21', 'A', 'b0000000-0000-4000-8000-000000000001', 1600000, 11200, true);

-- QC inspections -------------------------------------------------------------
insert into public.qc_inspections (id, batch_no, order_id, inspected_at, sample_size, measurements, reject_pct, result, customer_reason, internal_notes, published) values
  ('d1000000-0000-4000-8000-000000000001', 'B-26-0412', 'c1000000-0000-4000-8000-000000000004', '2026-09-12 09:30+03', 500,
   '{"crown_height_mm": [6.02, 6.01, 6.03], "press": "Press A", "cpk": 1.41}', 0.40, 'released', null, 'Line 1 SPC in control.', true),
  ('d1000000-0000-4000-8000-000000000002', 'B-26-0431', 'c1000000-0000-4000-8000-000000000001', '2026-09-21 15:00+03', 500,
   '{"crown_height_mm": [6.09, 6.11], "press": "Press B", "cpk": 0.92}', 2.10, 'on_hold', 'Held for a second inspection of print alignment.', 'Press B registration drifting, maintenance ticket raised.', true),
  ('d1000000-0000-4000-8000-000000000003', 'B-26-0435', 'c1000000-0000-4000-8000-000000000001', '2026-09-22 15:00+03', 500,
   '{"crown_height_mm": [6.02], "press": "Press B"}', 0.30, null, null, 'Not yet reviewed.', false),
  ('d2000000-0000-4000-8000-000000000001', 'B-26-0428', 'c2000000-0000-4000-8000-000000000001', '2026-09-21 16:00+03', 500,
   '{"press": "Press A"}', 0.70, 'released', null, null, true);

insert into public.qc_defects (inspection_id, defect_type, count) values
  ('d1000000-0000-4000-8000-000000000001', 'scratches', 1),
  ('d1000000-0000-4000-8000-000000000001', 'liner_voids', 1),
  ('d1000000-0000-4000-8000-000000000002', 'print_misregister', 8),
  ('d1000000-0000-4000-8000-000000000002', 'colour_variation', 2),
  ('d1000000-0000-4000-8000-000000000003', 'scratches', 1),
  ('d2000000-0000-4000-8000-000000000001', 'height_oot', 3);

-- Finished stock -------------------------------------------------------------
insert into public.finished_stock (company_id, brand_id, order_id, batch_no, quantity, location, ready_since, status) values
  ('11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000004', 'B-26-0412', 3000000, 'Warehouse bay 3, next to Line 1', '2026-09-12 12:00+03', 'available'),
  ('22222222-2222-4222-8222-222222222222', 'a2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'B-26-0428', 1500000, 'Warehouse bay 1', '2026-09-21 18:00+03', 'available');

-- Artwork, proofs, documents --------------------------------------------------
insert into public.artwork_versions (id, brand_id, version, file_path, approved_at) values
  ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 1, '11111111-1111-4111-8111-111111111111/artwork/habesha-v1.pdf', '2026-03-02 10:00+03'),
  ('e1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 1, '11111111-1111-4111-8111-111111111111/artwork/feta-v1.pdf',    '2026-03-02 10:00+03');

update public.brands set current_artwork_version_id = 'e1000000-0000-4000-8000-000000000001' where id = 'a1000000-0000-4000-8000-000000000001';
update public.brands set current_artwork_version_id = 'e1000000-0000-4000-8000-000000000002' where id = 'a1000000-0000-4000-8000-000000000002';

insert into public.proofs (brand_id, order_id, file_path, status) values
  ('a1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111/proofs/feta-v2-proof.pdf', 'sent');

insert into public.documents (company_id, brand_id, order_id, type, title, file_name, file_path, visibility) values
  ('11111111-1111-4111-8111-111111111111', 'a1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000004',
   'certificate_of_analysis', 'Certificate of analysis B-26-0412', 'coa-B-26-0412.pdf',
   '11111111-1111-4111-8111-111111111111/documents/coa-B-26-0412.pdf', 'customer'),
  ('11111111-1111-4111-8111-111111111111', null, 'c1000000-0000-4000-8000-000000000001',
   'internal_record', 'Line 2 Press B calibration record', 'line2-pressB-calibration.pdf',
   '11111111-1111-4111-8111-111111111111/documents/line2-pressB-calibration.pdf', 'internal'),
  ('22222222-2222-4222-8222-222222222222', null, 'c2000000-0000-4000-8000-000000000001',
   'certificate_of_analysis', 'Certificate of analysis B-26-0428', 'coa-B-26-0428.pdf',
   '22222222-2222-4222-8222-222222222222/documents/coa-B-26-0428.pdf', 'customer');
