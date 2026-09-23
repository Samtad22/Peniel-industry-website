-- ============================================================================
-- Helper functions, business-rule triggers and the audit trail
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Who is calling? (used by every RLS policy and customer view)
--
-- SECURITY DEFINER so they can read profiles without recursing into the
-- profiles RLS policy. Inactive profiles resolve to "nobody".
-- ---------------------------------------------------------------------------
create function app.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.active
$$;

create function app.my_company_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.company_id from public.profiles p
  where p.user_id = auth.uid() and p.active and p.role = 'customer_user'
$$;

create function app.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(app.my_role() <> 'customer_user', false)
$$;

create function app.has_role(variadic roles public.user_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(app.my_role() = any (roles), false)
$$;

grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on function app.my_role(), app.my_company_id(), app.is_staff(),
  app.has_role(public.user_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function app.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'brands', 'profiles', 'orders', 'production_entries',
    'qc_inspections', 'finished_stock', 'pickup_bookings', 'proofs'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I
         for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Order numbers: PN-YY-NNNN, sequential per calendar year in Addis Ababa
-- ---------------------------------------------------------------------------
create function app.assign_order_no()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  y int := extract(year from (now() at time zone 'Africa/Addis_Ababa'))::int;
  n int;
begin
  insert into app.order_counters as c (year, last_no) values (y, 1)
  on conflict (year) do update set last_no = c.last_no + 1
  returning c.last_no into n;

  new.order_no := format('PN-%s-%s', lpad((y % 100)::text, 2, '0'), lpad(n::text, 4, '0'));
  return new;
end
$$;

create trigger assign_order_no before insert on public.orders
  for each row execute function app.assign_order_no();

-- ---------------------------------------------------------------------------
-- Holds and date changes must carry a customer-facing reason
-- ---------------------------------------------------------------------------
create function app.check_order_reason()
returns trigger language plpgsql set search_path = ''
as $$
declare
  needs_reason boolean :=
       (new.status = 'on_hold' and (tg_op = 'INSERT' or old.status is distinct from 'on_hold'))
    or (tg_op = 'UPDATE' and new.revised_due_date is distinct from old.revised_due_date)
    or (tg_op = 'UPDATE' and old.confirmed_due_date is not null
        and new.confirmed_due_date is distinct from old.confirmed_due_date);
begin
  if needs_reason and nullif(btrim(new.customer_reason), '') is null then
    raise exception 'A customer_reason is required when putting an order on hold or changing its due date'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger check_order_reason before insert or update on public.orders
  for each row execute function app.check_order_reason();

-- ---------------------------------------------------------------------------
-- Customer timeline: one order_status_events row per status change
-- ---------------------------------------------------------------------------
create function app.record_order_status_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_events (order_id, status, customer_reason, internal_notes, created_by)
    values (new.id, new.status, new.customer_reason, new.internal_notes, auth.uid());
  end if;
  return null;
end
$$;

create trigger record_order_status_event after insert or update of status on public.orders
  for each row execute function app.record_order_status_event();

-- ---------------------------------------------------------------------------
-- Audit log: who, what, when, before/after
--
-- The action name highlights the change that matters (status, QC result,
-- publish flag); the full before/after rows are always stored.
-- ---------------------------------------------------------------------------
create function app.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  a jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  act text;
begin
  if tg_op = 'INSERT' then
    act := 'created';
  elsif tg_op = 'DELETE' then
    act := 'deleted';
  elsif (b -> 'status') is distinct from (a -> 'status') then
    act := case a ->> 'status' when 'on_hold' then 'hold' else 'status:' || (a ->> 'status') end;
  elsif (b -> 'result') is distinct from (a -> 'result') then
    act := case a ->> 'result' when 'on_hold' then 'hold' when 'released' then 'release' else 'result_cleared' end;
  elsif (b -> 'published') is distinct from (a -> 'published') then
    act := case when (a ->> 'published')::boolean then 'publish' else 'unpublish' end;
  elsif (b -> 'visibility') is distinct from (a -> 'visibility') then
    act := 'visibility:' || (a ->> 'visibility');
  else
    act := 'updated';
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (auth.uid(), act, tg_table_name, coalesce(a, b) ->> 'id', b, a);
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'brands', 'orders', 'order_attachments', 'production_entries',
    'qc_inspections', 'finished_stock', 'pickup_bookings', 'artwork_versions',
    'proofs', 'documents'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function app.audit_row()', t);
  end loop;
end $$;

-- profiles are keyed by user_id, not id
create function app.audit_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  b jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  a jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    case tg_op when 'INSERT' then 'invited' when 'DELETE' then 'deleted'
      else case when (b -> 'active') is distinct from (a -> 'active')
        then case when (a ->> 'active')::boolean then 'activated' else 'deactivated' end
        else 'updated' end
    end,
    'profiles', coalesce(a, b) ->> 'user_id', b, a);
  return null;
end
$$;

create trigger audit after insert or update or delete on public.profiles
  for each row execute function app.audit_profile();

-- ---------------------------------------------------------------------------
-- last_login_at follows Supabase Auth sign-ins
-- ---------------------------------------------------------------------------
create function app.sync_last_login()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles set last_login_at = new.last_sign_in_at where user_id = new.id;
  end if;
  return null;
end
$$;

create trigger sync_last_login after update of last_sign_in_at on auth.users
  for each row execute function app.sync_last_login();
