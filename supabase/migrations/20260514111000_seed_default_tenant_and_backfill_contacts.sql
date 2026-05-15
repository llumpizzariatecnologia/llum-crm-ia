insert into public.tenants (name, slug)
values ('LLUM', 'llum')
on conflict (slug) do nothing;

with llum_tenant as (
  select id
  from public.tenants
  where slug = 'llum'
  limit 1
),
legacy_customers as (
  select
    c.id as legacy_customer_id,
    c.name,
    c.phone,
    c.wa_id,
    c.source,
    c.metadata,
    c.first_seen_at,
    c.last_seen_at,
    c.created_at,
    c.updated_at,
    regexp_replace(coalesce(c.wa_id, c.phone, ''), '\D', '', 'g') as normalized_primary,
    regexp_replace(coalesce(c.phone, c.wa_id, ''), '\D', '', 'g') as normalized_phone
  from public.customers c
),
prepared_contacts as (
  select
    gen_random_uuid() as id,
    t.id as tenant_id,
    case
      when lc.normalized_primary <> '' then lc.normalized_primary
      else 'legacy-' || lc.legacy_customer_id::text
    end as wa_id,
    case
      when lc.normalized_phone <> '' then
        case
          when lc.phone like '+%' then lc.phone
          else '+' || lc.normalized_phone
        end
      when lc.normalized_primary <> '' then '+' || lc.normalized_primary
      else 'legacy-' || lc.legacy_customer_id::text
    end as phone,
    lc.name as display_name,
    coalesce(lc.first_seen_at, lc.created_at, now()) as first_seen_at,
    coalesce(lc.last_seen_at, lc.updated_at, lc.created_at, now()) as last_seen_at,
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'legacy_customers_backfill',
        'legacy_customer_id', lc.legacy_customer_id,
        'legacy_source', lc.source,
        'legacy_metadata', lc.metadata
      )
    ) as metadata,
    coalesce(lc.created_at, now()) as created_at,
    coalesce(lc.updated_at, lc.created_at, now()) as updated_at
  from legacy_customers lc
  cross join llum_tenant t
)
insert into public.contacts (
  id,
  tenant_id,
  wa_id,
  phone,
  display_name,
  first_seen_at,
  last_seen_at,
  metadata,
  created_at,
  updated_at
)
select
  pc.id,
  pc.tenant_id,
  pc.wa_id,
  pc.phone,
  pc.display_name,
  pc.first_seen_at,
  pc.last_seen_at,
  pc.metadata,
  pc.created_at,
  pc.updated_at
from prepared_contacts pc
on conflict (tenant_id, wa_id) do update
set
  phone = excluded.phone,
  display_name = coalesce(excluded.display_name, public.contacts.display_name),
  first_seen_at = least(public.contacts.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(public.contacts.last_seen_at, excluded.last_seen_at),
  metadata = public.contacts.metadata || excluded.metadata,
  updated_at = greatest(public.contacts.updated_at, excluded.updated_at);
