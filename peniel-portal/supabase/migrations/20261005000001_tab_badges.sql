-- ============================================================================
-- Tab badges: "new since you last opened this tab"
--
-- nav_seen keeps, per person and per tab, when they last opened it. The
-- portal counts what changed after that and shows it as a badge; opening
-- the tab clears it. Everyone reads and writes only their own rows.
--
-- Existing users start from now, so nobody opens the portal to a pile of
-- old badges. Safe to run more than once.
-- ============================================================================
create table if not exists public.nav_seen (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  area    text not null check (area ~ '^[a-z_]{2,30}$'),
  seen_at timestamptz not null default now(),
  primary key (user_id, area)
);

alter table public.nav_seen enable row level security;
revoke all on public.nav_seen from anon;
revoke all on public.nav_seen from authenticated;
grant select, insert, update on public.nav_seen to authenticated;

drop policy if exists own_rows on public.nav_seen;
create policy own_rows on public.nav_seen for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Everyone already in the portal starts with every tab "seen" now.
insert into public.nav_seen (user_id, area, seen_at)
select p.user_id, a.area, now()
from public.profiles p
cross join unnest(case when p.role = 'customer_user'
  then array['orders', 'production', 'artwork', 'documents', 'messages']
  else array['orders', 'production', 'inventory', 'documents', 'settings'] end) as a(area)
on conflict (user_id, area) do nothing;
