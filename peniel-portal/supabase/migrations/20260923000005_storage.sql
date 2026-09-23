-- ============================================================================
-- Private Storage buckets
--
-- Every object lives under `{company_id}/…`. Nothing is public; files reach
-- people through short-lived signed URLs that the server creates only after
-- confirming the file is visible to the caller (via the customer_* views for
-- customers, or RLS for staff).
--
-- Customers may only UPLOAD, and only purchase orders / specs into their own
-- company folder in `order-attachments`. They have no SELECT policy, so they
-- cannot list or download objects directly.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b, b, false, 20 * 1024 * 1024, array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
from unnest(array['order-attachments', 'documents', 'artwork', 'proofs', 'crowns']) as b
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "portal: staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('order-attachments', 'documents', 'artwork', 'proofs', 'crowns')
    and app.is_staff()
  );

create policy "portal: staff insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('order-attachments', 'documents', 'artwork', 'proofs', 'crowns')
    and app.has_role('admin', 'sales')
  );

create policy "portal: staff update"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('order-attachments', 'documents', 'artwork', 'proofs', 'crowns')
    and app.has_role('admin', 'sales')
  );

create policy "portal: staff delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('order-attachments', 'documents', 'artwork', 'proofs', 'crowns')
    and app.has_role('admin', 'sales')
  );

-- Customers: upload into order-attachments/{their company_id}/{their order_id}/…
create policy "portal: customer upload own order attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-attachments'
    and (storage.foldername(name))[1] = app.my_company_id()::text
    and exists (
      select 1 from public.customer_orders o
      where o.id::text = (storage.foldername(name))[2]
    )
  );
