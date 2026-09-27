-- ============================================================================
-- Certificate of Analysis: admin can sign "Prepared by" too
--
-- The quality manager (role quality) or admin signs the certificate's one
-- signature, as themselves: their own name, signature and date are printed.
-- Everything else stays as in 20261010000001 / 20261011000001.
-- Safe to run more than once.
-- ============================================================================

drop policy if exists quality_sign on public.coa_signatures;
create policy quality_sign on public.coa_signatures for insert to authenticated
  with check (app.has_role('admin', 'quality'));
