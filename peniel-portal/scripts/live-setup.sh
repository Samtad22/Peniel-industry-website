#!/usr/bin/env bash
# Print one SQL file that sets up a NEW, EMPTY Supabase project for the live
# portal: every migration in order, then the reference lists (defect types,
# hold reasons, production lines, raw materials). No sample data.
#
#   bash scripts/live-setup.sh > peniel-live-setup.sql
#
# Paste the output into the live project's SQL Editor and run it once. It
# refuses to run on a project that already has the portal tables.
set -euo pipefail
cd "$(dirname "$0")/.."

cat <<'SQL'
-- ============================================================================
-- Peniel Portal — LIVE database setup (one file)
--
-- Run this ONCE, in the SQL Editor of the NEW, EMPTY live Supabase project.
-- Do NOT run it on the test project (bjaxhmkyxmcrqiebtzzo).
--
-- It contains every migration in supabase/migrations/, in order, followed by
-- the reference lists the portal needs (defect types, hold reasons,
-- production lines, raw materials). No sample customers, orders or users.
--
-- If anything fails, nothing is kept: fix the problem and run it again.
-- ============================================================================

do $$
begin
  if to_regclass('public.orders') is not null then
    raise exception 'This project already has the Peniel Portal tables. Run this only on a new, empty project.';
  end if;
end $$;
SQL

for f in supabase/migrations/*.sql; do
  printf '\n\n-- >>>>>>>>>> %s\n\n' "$(basename "$f")"
  cat "$f"
done

cat <<'SQL'


-- ============================================================================
-- Reference lists (edit any names here before running, or rename later)
-- ============================================================================

-- Defect types customers see on quality results: the visual checks of the
-- Certificate of Analysis (PIC-OF-053), set by the CoA migration above.

-- Customer-facing hold reasons staff can pick from.
insert into public.hold_reason_presets (text, sort_order) values
  ('Waiting for your approval of the updated artwork.', 1),
  ('Waiting for clarification on the purchase order.', 2),
  ('Raw material delivery delayed — we will confirm a new date shortly.', 3),
  ('Batch under re-inspection by our quality team.', 4),
  ('Production rescheduled — see the revised due date.', 5)
on conflict (text) do nothing;

-- Production lines (internal only; customers never see these names).
insert into public.production_lines (name) values
  ('Line 1 — Press A'),
  ('Line 2 — Press B')
on conflict (name) do nothing;

-- Raw materials, starting at zero. Record deliveries in Ops → Inventory.
insert into public.raw_materials (name, unit, on_hand, reorder_level) values
  ('Tinplate sheet 0.23 mm',  'sheets', 0, 50000),
  ('PVC-free liner compound', 'kg',     0, 1500),
  ('Printing ink',            'kg',     0, 100),
  ('Lacquer',                 'L',      0, 200)
on conflict (name) do nothing;

select 'Peniel Portal live database is set up.' as result;
SQL
