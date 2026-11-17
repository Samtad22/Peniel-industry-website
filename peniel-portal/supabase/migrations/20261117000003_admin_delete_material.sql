-- ============================================================================
-- Admin deletes an Inventory item (raw material or ink) for good
--
-- Taking an item off the list (active = false) keeps its history. Deleting
-- removes it completely, for duplicates and mistakes:
--   * its movements (deliveries, use, counts) are deleted with it, so the
--     reports no longer show them;
--   * an ink is also taken out of the ink figures of printed stillages and
--     sample sheets (their other inks stay), and its grams per sheet go;
--   * the activity log keeps a "deleted" row with the item and how many
--     movements went with it.
-- One call, all or nothing: public.admin_delete_material(id). Admin only;
-- the database also refuses anyone else deleting a raw material directly.
-- A brand that still prints the ink's colour gets the ink back (at 0 kg)
-- the next time that brand's colours are changed.
--
-- Internal only. Safe to run more than once.
-- ============================================================================

drop policy if exists admin_only_delete on public.raw_materials;
create policy admin_only_delete on public.raw_materials as restrictive for delete to authenticated using (app.has_role('admin'));

create or replace function public.admin_delete_material(p_id uuid) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  m public.raw_materials;
  v_moves int;
  v_runs int := 0;
  v_samples int := 0;
begin
  if not app.has_role('admin') then
    raise exception 'Only admin deletes Inventory items.' using errcode = '42501';
  end if;
  select * into m from public.raw_materials where id = p_id for update;
  if not found then
    raise exception 'That item is not on the list (not_found).' using errcode = 'P0002';
  end if;

  -- An ink: out of the ink figures that name it (their use is recounted without it).
  if m.ink_name is not null then
    update public.print_runs set inks = inks - p_id::text where inks ? p_id::text;
    get diagnostics v_runs = row_count;
    update public.sample_sheets set inks = inks - p_id::text where inks ? p_id::text;
    get diagnostics v_samples = row_count;
  end if;

  delete from public.raw_material_movements where material_id = p_id;
  get diagnostics v_moves = row_count;

  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (auth.uid(), 'deleted', 'raw_materials', p_id::text,
          to_jsonb(m) || jsonb_build_object('movements_deleted', v_moves, 'stillages_changed', v_runs, 'samples_changed', v_samples),
          null);

  -- Grams per sheet go with it (on delete cascade).
  delete from public.raw_materials where id = p_id;

  return jsonb_build_object('name', coalesce(m.ink_name, m.name), 'movements', v_moves, 'stillages', v_runs, 'samples', v_samples);
end
$$;
revoke all on function public.admin_delete_material(uuid) from public, anon;
grant execute on function public.admin_delete_material(uuid) to authenticated;
