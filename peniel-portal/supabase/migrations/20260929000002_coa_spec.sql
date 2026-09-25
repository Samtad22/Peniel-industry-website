-- ============================================================================
-- Certificate of Analysis (PIC-OF-053, revision 006)
--
-- The visual checks on the quality team's Certificate of Analysis become the
-- defect types QC records, in CoA order. Their standard is 0% in the sample.
-- The five placeholder types from the original design are retired (kept for
-- past inspections, hidden from new ones). The measured parameters and their
-- limits live in lib/qc.ts; measurements stay internal.
--
-- Safe to run more than once.
-- ============================================================================

alter table public.defect_types add column if not exists sort_order int not null default 100;

insert into public.defect_types (code, customer_label, sort_order, active) values
  ('corrosion',           'Corrosion',                  12, true),
  ('empty_shell',         'Empty shell',                13, true),
  ('disc_not_adhering',   'Disc not properly adhering', 14, true),
  ('incomplete_liner',    'Incomplete liner',           15, true),
  ('incorrect_size',      'Incorrect size crowns',      16, true),
  ('bent_crowns',         'Bent crowns',                17, true),
  ('liner_splash',        'Liner splash',               18, true),
  ('scratched_graphics',  'Scratched graphics',         19, true),
  ('odor',                'Odor',                       20, true),
  ('off_center_graphics', 'Off-center graphics',        21, true),
  ('dirty_liner',         'Dirty liner',                22, true),
  ('blurred_graphics',    'Blurred graphics',           23, true),
  ('lubricant_migration', 'Lubricant migration',        24, true)
on conflict (code) do update
  set customer_label = excluded.customer_label, sort_order = excluded.sort_order, active = true;

update public.defect_types set active = false
where code in ('print_misregister', 'liner_voids', 'height_oot', 'scratches', 'colour_variation');
