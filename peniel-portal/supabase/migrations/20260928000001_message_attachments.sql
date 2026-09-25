-- ============================================================================
-- Files attached to messages between Peniel and a customer
--
-- Files live in the private `message-attachments` bucket under
-- `{company_id}/…` and are served through short-lived signed URLs.
-- Customers see files on their own company's conversations only, and never
-- files attached to a staff internal note.
--
-- Safe to run more than once.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-attachments', 'message-attachments', false, 20 * 1024 * 1024, array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff who can write messages may upload; customers only into their own
-- company folder. Nobody lists or downloads directly (signed URLs only).
drop policy if exists "portal: message attachments staff insert" on storage.objects;
create policy "portal: message attachments staff insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and app.is_staff());

drop policy if exists "portal: message attachments customer insert" on storage.objects;
create policy "portal: message attachments customer insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = app.my_company_id()::text
  );

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  thread_id   uuid not null references public.message_threads (id) on delete cascade,
  company_id  uuid not null references public.companies (id),
  file_path   text not null unique,
  file_name   text not null check (length(btrim(file_name)) between 1 and 200),
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  mime_type   text,
  uploaded_by uuid references public.profiles (user_id) default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint message_attachments_company_folder check (file_path like company_id::text || '/%' and file_path not like '%..%')
);
create index if not exists message_attachments_thread_idx on public.message_attachments (thread_id, created_at);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);

-- thread_id and company_id always come from the message, never the caller.
create or replace function app.fill_message_attachment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  select m.thread_id, t.company_id into new.thread_id, new.company_id
  from public.messages m
  join public.message_threads t on t.id = m.thread_id
  where m.id = new.message_id;
  return new;
end
$$;

drop trigger if exists fill_message_attachment on public.message_attachments;
create trigger fill_message_attachment
  before insert or update on public.message_attachments
  for each row execute function app.fill_message_attachment();

alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon;
revoke all on public.message_attachments from authenticated;
grant select, insert, delete on public.message_attachments to authenticated;

drop policy if exists staff_read on public.message_attachments;
create policy staff_read on public.message_attachments for select to authenticated
  using (app.is_staff());
drop policy if exists staff_insert on public.message_attachments;
create policy staff_insert on public.message_attachments for insert to authenticated
  with check (app.is_staff());
drop policy if exists admin_delete on public.message_attachments;
create policy admin_delete on public.message_attachments for delete to authenticated
  using (app.has_role('admin'));

-- ---------------------------------------------------------------------------
-- Customer view: own company, never on internal notes
-- ---------------------------------------------------------------------------
create or replace view public.customer_message_attachments with (security_barrier = true) as
select
  a.id,
  a.message_id,
  a.thread_id,
  a.file_path,
  a.file_name,
  a.size_bytes,
  a.mime_type,
  (p.role <> 'customer_user') as from_peniel,
  p.full_name as uploaded_by_name,
  a.created_at
from public.message_attachments a
join public.messages m on m.id = a.message_id
left join public.profiles p on p.user_id = a.uploaded_by
where a.company_id = app.my_company_id() and not m.internal;

revoke all on public.customer_message_attachments from anon, authenticated;
grant select on public.customer_message_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- Customers send a message with up to 5 files they have already uploaded
-- ---------------------------------------------------------------------------
drop function if exists public.customer_send_message(text, uuid, text, uuid);

create or replace function public.customer_send_message(
  p_body        text,
  p_thread_id   uuid default null,
  p_subject     text default null,
  p_order_id    uuid default null,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  cid uuid := app.require_customer();
  tid uuid := p_thread_id;
  mid uuid;
  f jsonb;
begin
  if nullif(btrim(p_body), '') is null then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) is distinct from 'array'
     or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then
    raise exception 'Attach up to 5 files' using errcode = '22023';
  end if;

  -- Every file must already be in Storage, inside the caller's company folder.
  for f in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if (f ->> 'path') is null
       or (f ->> 'path') not like cid::text || '/%'
       or (f ->> 'path') like '%..%'
       or not exists (
         select 1 from storage.objects so
         where so.bucket_id = 'message-attachments' and so.name = f ->> 'path'
       ) then
      perform app.deny();
    end if;
  end loop;

  if tid is null then
    if nullif(btrim(p_subject), '') is null then
      raise exception 'A subject is required for a new conversation' using errcode = '22023';
    end if;
    if p_order_id is not null
       and not exists (select 1 from public.orders o where o.id = p_order_id and o.company_id = cid) then
      perform app.deny();
    end if;
    insert into public.message_threads (company_id, order_id, subject, created_by)
    values (cid, p_order_id, btrim(p_subject), auth.uid())
    returning id into tid;
  elsif not exists (select 1 from public.message_threads t where t.id = tid and t.company_id = cid) then
    perform app.deny();
  end if;

  insert into public.messages (thread_id, author_id, body, read_by_customer)
  values (tid, auth.uid(), btrim(p_body), true)
  returning id into mid;

  insert into public.message_attachments (message_id, thread_id, company_id, file_path, file_name, size_bytes, mime_type, uploaded_by)
  select mid, tid, cid, a ->> 'path', left(nullif(btrim(a ->> 'name'), ''), 200), (a ->> 'size')::bigint, a ->> 'mime', auth.uid()
  from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) a;

  update public.message_threads set last_message_at = now() where id = tid;
  return tid;
end
$$;

revoke all on function public.customer_send_message(text, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.customer_send_message(text, uuid, text, uuid, jsonb) to authenticated;
