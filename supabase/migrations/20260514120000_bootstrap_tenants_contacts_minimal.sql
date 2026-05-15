create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  wa_id text not null,
  phone text not null,
  display_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, wa_id)
);

alter table public.tenants enable row level security;
alter table public.contacts enable row level security;

drop policy if exists tenants_authenticated_select on public.tenants;
create policy tenants_authenticated_select on public.tenants
  for select using (auth.role() = 'authenticated');

drop policy if exists contacts_workspace_isolation on public.contacts;
create policy contacts_workspace_isolation on public.contacts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
