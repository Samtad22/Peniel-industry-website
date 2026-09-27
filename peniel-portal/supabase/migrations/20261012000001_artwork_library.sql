-- ============================================================================
-- Artwork library: each brand's artwork files, in two sections
--
-- 1. design: the customer's artwork, usually one crown with its design,
--    dimensions and Pantone colours (AI, EPS, PDF…). Staff with artwork
--    access (admin, sales, quality) read; admin and sales add and remove.
-- 2. print_layout: the 702-up sheet layout that goes to the CTP machine.
--    ADMIN ONLY: nobody else, staff or customer, reads, adds or removes them.
--
-- Files live in the private `artwork-library` bucket under
-- `{company_id}/design/…` or `{company_id}/print-layout/…`; the storage
-- policies follow the same split. Customers never read either (no customer
-- view or policy). Audited. Safe to run more than once.
-- ============================================================================

create table if not exists public.brand_artwork_files (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands (id) on delete cascade,
  kind       text not null check (kind in ('design', 'print_layout')),
  title      text check (length(title) <= 200),
  file_path  text not null unique check (length(file_path) <= 500),
  file_name  text not null check (length(file_name) <= 255),
  size_bytes bigint check (size_bytes >= 0),
  -- print_layout: crowns on the sheet (702 on Peniel's sheets).
  ups        int check (ups between 1 and 5000),
  notes      text check (length(notes) <= 1000),
  uploaded_by uuid references public.profiles (user_id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists brand_artwork_files_brand_idx on public.brand_artwork_files (brand_id, kind, created_at desc);

comment on table public.brand_artwork_files is
  'Artwork library per brand: design (the customer''s single-crown artwork; admin, sales, quality read) and print_layout (the 702-up CTP layout; ADMIN ONLY). No customer view reads this table.';

-- A row points only at a file in its own section and its brand's company folder
-- (so nobody can hand out a print layout through a design row).
create or replace function app.brand_artwork_files_check() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_folder text := case new.kind when 'print_layout' then 'print-layout' else 'design' end;
begin
  select b.company_id into v_company from public.brands b where b.id = new.brand_id;
  if v_company is null or new.file_path not like v_company::text || '/' || v_folder || '/%' then
    raise exception 'The file is not in this brand''s % folder.', new.kind using errcode = '23514';
  end if;
  new.title := nullif(btrim(new.title), '');
  new.notes := nullif(btrim(new.notes), '');
  return new;
end
$$;

drop trigger if exists check_path on public.brand_artwork_files;
create trigger check_path before insert or update on public.brand_artwork_files
  for each row execute function app.brand_artwork_files_check();

alter table public.brand_artwork_files enable row level security;
revoke all on public.brand_artwork_files from anon;
revoke all on public.brand_artwork_files from authenticated;
grant select, insert, update, delete on public.brand_artwork_files to authenticated;

drop policy if exists read_by_kind on public.brand_artwork_files;
create policy read_by_kind on public.brand_artwork_files for select to authenticated
  using (case when kind = 'print_layout' then app.has_role('admin') else app.has_role('admin', 'sales', 'quality') end);
drop policy if exists write_by_kind on public.brand_artwork_files;
create policy write_by_kind on public.brand_artwork_files for all to authenticated
  using (case when kind = 'print_layout' then app.has_role('admin') else app.has_role('admin', 'sales') end)
  with check (case when kind = 'print_layout' then app.has_role('admin') else app.has_role('admin', 'sales') end);

drop trigger if exists audit on public.brand_artwork_files;
create trigger audit after insert or update or delete on public.brand_artwork_files
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Storage: a private bucket for the library. Designers' files are large, so
-- the limit is 200 MB (the Supabase project's own upload limit also applies).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork-library', 'artwork-library', false, 200 * 1024 * 1024, array[
  'application/postscript',
  'application/pdf',
  'image/jpeg',
  'image/png'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Which section a stored file belongs to: `{company_id}/design/…` or `{company_id}/print-layout/…`.
create or replace function app.artwork_library_can(p_name text, p_write boolean) returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select case (storage.foldername(p_name))[2]
    when 'design' then case when p_write then app.has_role('admin', 'sales') else app.has_role('admin', 'sales', 'quality') end
    when 'print-layout' then app.has_role('admin')
    else false
  end
$$;
revoke all on function app.artwork_library_can(text, boolean) from public;
grant execute on function app.artwork_library_can(text, boolean) to authenticated;

drop policy if exists "portal: artwork library read" on storage.objects;
create policy "portal: artwork library read" on storage.objects for select to authenticated
  using (bucket_id = 'artwork-library' and app.artwork_library_can(name, false));
drop policy if exists "portal: artwork library insert" on storage.objects;
create policy "portal: artwork library insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'artwork-library' and app.artwork_library_can(name, true));
drop policy if exists "portal: artwork library delete" on storage.objects;
create policy "portal: artwork library delete" on storage.objects for delete to authenticated
  using (bucket_id = 'artwork-library' and app.artwork_library_can(name, true));
