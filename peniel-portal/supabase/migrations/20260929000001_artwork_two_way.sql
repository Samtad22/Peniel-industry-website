-- ============================================================================
-- Artwork both ways
--
-- 1. Customers send artwork to Peniel (artwork_submissions): Peniel reviews
--    it, answers in words the customer sees (staff_comment), and can lock an
--    accepted file as the brand's approved artwork.
-- 2. Proofs Peniel sends can be physical samples: by courier (e.g. DHL, with
--    a tracking number the customer can follow) or by a Peniel driver. The
--    driver's name and vehicle are internal and never reach a customer.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Proofs: physical delivery
-- ---------------------------------------------------------------------------
alter table public.proofs
  add column if not exists physical_delivery text,
  add column if not exists courier           text,
  add column if not exists tracking_number   text,
  add column if not exists dispatched_at     timestamptz,
  add column if not exists delivery_driver   text,   -- internal
  add column if not exists delivery_vehicle  text;   -- internal

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'proofs_physical_delivery_check') then
    alter table public.proofs add constraint proofs_physical_delivery_check
      check (physical_delivery in ('courier', 'peniel_driver'));
  end if;
  -- A physical-only proof has no digital file.
  if not exists (select 1 from pg_constraint where conname = 'proofs_file_or_physical') then
    alter table public.proofs alter column file_path drop not null;
    alter table public.proofs add constraint proofs_file_or_physical
      check (file_path is not null or physical_delivery is not null);
  end if;
end $$;

-- Columns are only ever appended to the customer view.
create or replace view public.customer_proofs with (security_barrier = true) as
select
  p.id,
  p.brand_id,
  b.name as brand_name,
  p.order_id,
  p.file_path,
  p.status,
  p.customer_comment,
  p.responded_at,
  p.created_at,
  p.version,
  p.note,
  p.approve_by,
  p.file_name,
  p.size_bytes,
  p.mime_type,
  o.order_no,
  r.full_name as responded_by_name,
  p.physical_delivery,
  p.courier,
  p.tracking_number,
  p.dispatched_at
from public.proofs p
join public.brands b on b.id = p.brand_id
left join public.orders o on o.id = p.order_id
left join public.profiles r on r.user_id = p.responded_by
where b.company_id = app.my_company_id();

-- ---------------------------------------------------------------------------
-- Artwork the customer sends to Peniel
-- ---------------------------------------------------------------------------
create table if not exists public.artwork_submissions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id),
  brand_id      uuid,
  order_id      uuid,
  title         text not null check (length(btrim(title)) between 1 and 150),
  note          text check (length(note) <= 2000),
  file_path     text not null unique,
  file_name     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  mime_type     text,
  status        text not null default 'submitted' check (status in ('submitted', 'accepted', 'changes_requested')),
  staff_comment text check (length(staff_comment) <= 2000),  -- shown to the customer
  submitted_by  uuid references public.profiles (user_id) default auth.uid(),
  reviewed_by   uuid references public.profiles (user_id),
  reviewed_at   timestamptz,
  artwork_version_id uuid references public.artwork_versions (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- the brand and order must belong to the same customer
  foreign key (brand_id, company_id) references public.brands (id, company_id),
  foreign key (order_id, company_id) references public.orders (id, company_id),
  constraint artwork_submissions_company_folder check (file_path like company_id::text || '/submissions/%' and file_path not like '%..%'),
  constraint artwork_submissions_changes_need_comment check (status <> 'changes_requested' or nullif(btrim(staff_comment), '') is not null)
);
create index if not exists artwork_submissions_company_idx on public.artwork_submissions (company_id, created_at desc);

alter table public.artwork_submissions enable row level security;
revoke all on public.artwork_submissions from anon, authenticated;
grant select, update on public.artwork_submissions to authenticated;

drop policy if exists staff_read on public.artwork_submissions;
create policy staff_read on public.artwork_submissions for select to authenticated
  using (app.is_staff());
drop policy if exists staff_review on public.artwork_submissions;
create policy staff_review on public.artwork_submissions for update to authenticated
  using (app.has_role('admin', 'sales')) with check (app.has_role('admin', 'sales'));

drop trigger if exists audit on public.artwork_submissions;
create trigger audit after insert or update or delete on public.artwork_submissions
  for each row execute function app.audit_row();

-- Customer view: own company only, no internal columns.
create or replace view public.customer_artwork_submissions with (security_barrier = true) as
select
  s.id,
  s.brand_id,
  b.name as brand_name,
  s.order_id,
  o.order_no,
  s.title,
  s.note,
  s.file_path,
  s.file_name,
  s.size_bytes,
  s.mime_type,
  s.status,
  s.staff_comment,
  s.reviewed_at,
  s.created_at,
  p.full_name as submitted_by_name
from public.artwork_submissions s
left join public.brands b on b.id = s.brand_id
left join public.orders o on o.id = s.order_id
left join public.profiles p on p.user_id = s.submitted_by
where s.company_id = app.my_company_id();

revoke all on public.customer_artwork_submissions from anon, authenticated;
grant select on public.customer_artwork_submissions to authenticated;

-- Customers upload into artwork/{their company}/submissions/… only.
drop policy if exists "portal: customer artwork submissions insert" on storage.objects;
create policy "portal: customer artwork submissions insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'artwork'
    and (storage.foldername(name))[1] = app.my_company_id()::text
    and (storage.foldername(name))[2] = 'submissions'
  );

-- Send a file (already uploaded) to Peniel for review.
create or replace function public.customer_submit_artwork(
  p_title    text,
  p_path     text,
  p_name     text,
  p_size     bigint,
  p_mime     text default null,
  p_brand_id uuid default null,
  p_order_id uuid default null,
  p_note     text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  new_id uuid;
begin
  if nullif(btrim(p_title), '') is null then
    raise exception 'Give the artwork a title' using errcode = '22023';
  end if;
  if p_brand_id is not null
     and not exists (select 1 from public.brands b where b.id = p_brand_id and b.company_id = cid) then
    perform app.deny();
  end if;
  if p_order_id is not null
     and not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = cid) then
    perform app.deny();
  end if;
  if p_path is null
     or p_path not like cid::text || '/submissions/%'
     or p_path like '%..%'
     or not exists (select 1 from storage.objects so where so.bucket_id = 'artwork' and so.name = p_path) then
    perform app.deny();
  end if;

  insert into public.artwork_submissions
    (company_id, brand_id, order_id, title, note, file_path, file_name, size_bytes, mime_type, submitted_by)
  values
    (cid, p_brand_id, p_order_id, left(btrim(p_title), 150), nullif(btrim(p_note), ''),
     p_path, left(coalesce(nullif(btrim(p_name), ''), 'artwork'), 200), p_size, p_mime, auth.uid())
  returning id into new_id;
  return new_id;
end
$$;

revoke all on function public.customer_submit_artwork(text, text, text, bigint, text, uuid, uuid, text) from public, anon;
grant execute on function public.customer_submit_artwork(text, text, text, bigint, text, uuid, uuid, text) to authenticated;
