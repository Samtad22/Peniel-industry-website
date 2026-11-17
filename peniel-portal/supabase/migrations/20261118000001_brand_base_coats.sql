-- ============================================================================
-- Every brand's base coat: transparent or white
--
-- From Peniel: every sheet gets one base coat, never both.
--   * Coca-Cola products (East Africa Bottling: Coca, Sprite, Fanta, Novida)
--     and Habesha products (Habesha, Negus, Kidame, Feta, Kostara):
--     transparent base coat.
--   * Every other brand: white base coat.
--
-- 1. Sets brands.base_coat on every brand by that rule.
-- 2. A new brand saved without a coat gets it by the same rule (staff can
--    still change it on the brand under Customers).
-- 3. Lists each customer's brands and their coat (the SQL Editor shows it).
--
-- The dashboard's "Production from stock" then splits the plant's pace
-- between the two coats by what the open orders still need of each.
-- Internal only. Safe to run more than once.
-- ============================================================================

-- The coat a brand gets by the rule.
create or replace function app.base_coat_by_rule(p_company uuid, p_brand_name text) returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(c.name, '')) ~ '(^habesha|^east africa bottling|coca[- ]?cola)'
      or lower(coalesce(p_brand_name, '')) ~ '^(coca|sprite|fanta|novida)'
      then 'transparent'
    else 'white'
  end
  from (select 1) one
  left join public.companies c on c.id = p_company
$$;
revoke all on function app.base_coat_by_rule(uuid, text) from public, anon, authenticated;

update public.brands b
set base_coat = app.base_coat_by_rule(b.company_id, b.name)
where b.base_coat is distinct from app.base_coat_by_rule(b.company_id, b.name);

-- A new brand without a coat: the rule's.
create or replace function app.brands_default_base_coat() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.base_coat is null then
    new.base_coat := app.base_coat_by_rule(new.company_id, new.name);
  end if;
  return new;
end
$$;
drop trigger if exists default_base_coat on public.brands;
create trigger default_base_coat before insert on public.brands
  for each row execute function app.brands_default_base_coat();

comment on column public.brands.base_coat is 'INTERNAL. white / transparent: the base coat the brand''s sheets get in the big oven before printing (one, never both). Coca-Cola and Habesha products: transparent; others: white (a new brand gets it by that rule).';

-- What was set.
select c.name as customer, b.name as brand, b.base_coat
from public.brands b join public.companies c on c.id = b.company_id
where b.active
order by b.base_coat, c.name, b.name;
