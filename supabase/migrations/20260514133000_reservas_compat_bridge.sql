create extension if not exists "pgcrypto";

create schema if not exists crm;
create schema if not exists agentes;
create schema if not exists marketing;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    create type public.app_role as enum (
      'admin', 'gerente', 'cozinha', 'estoque', 'atendimento', 'marketing'
    );
  end if;
end
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(r public.app_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = r
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.has_role('admin'::public.app_role);
$$;

create table if not exists crm.customers (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  whatsapp text,
  data_nascimento date,
  instagram text,
  origem text,
  tags text[],
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_crm_customers_telefone
  on crm.customers(telefone)
  where telefone is not null;

create unique index if not exists idx_crm_customers_email
  on crm.customers(email)
  where email is not null;

create table if not exists crm.interactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references crm.customers(id) on delete cascade,
  canal text not null,
  direcao text not null,
  conteudo text,
  sentiment_score numeric(4,3),
  agente text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_interactions_customer
  on crm.interactions(customer_id, created_at desc);

create table if not exists agentes.message_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  channel text not null default 'whatsapp',
  trigger_type text not null check (trigger_type in ('event', 'cron')),
  trigger_config jsonb not null default '{}'::jsonb,
  template text not null,
  active boolean not null default true,
  meta_template_name text,
  meta_template_lang text not null default 'pt_BR',
  meta_has_url_button boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agentes_message_templates_updated_at on agentes.message_templates;
create trigger trg_agentes_message_templates_updated_at
before update on agentes.message_templates
for each row execute function public.set_updated_at();

create table if not exists marketing.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  plataforma text not null,
  campanha_id_externo text,
  status text not null default 'rascunho',
  orcamento numeric(12,2),
  gasto numeric(12,2),
  impressoes integer,
  cliques integer,
  conversoes integer,
  inicio timestamptz,
  fim timestamptz,
  criado_por text,
  aprovado_por uuid references auth.users(id) on delete set null,
  metadata jsonb,
  kind text,
  template_slug text,
  segment_filter jsonb not null default '{}'::jsonb,
  trigger_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_run_at timestamptz,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_marketing_campanhas_updated_at on marketing.campanhas;
create trigger trg_marketing_campanhas_updated_at
before update on marketing.campanhas
for each row execute function public.set_updated_at();

create table if not exists marketing.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing.campanhas(id) on delete cascade,
  customer_id uuid not null references crm.customers(id) on delete cascade,
  trigger_year smallint not null,
  sent_at timestamptz not null default now(),
  ok boolean not null default true,
  error text
);

create unique index if not exists idx_camp_sends_unique
  on marketing.campaign_sends(campaign_id, customer_id, trigger_year);

create index if not exists idx_camp_sends_customer
  on marketing.campaign_sends(customer_id);

alter table public.user_roles enable row level security;
alter table crm.customers enable row level security;
alter table crm.interactions enable row level security;
alter table agentes.message_templates enable row level security;
alter table marketing.campanhas enable row level security;
alter table marketing.campaign_sends enable row level security;

drop policy if exists roles_self on public.user_roles;
create policy roles_self on public.user_roles
  for select using (user_id = auth.uid());

drop policy if exists roles_admin on public.user_roles;
create policy roles_admin on public.user_roles
  for all using (public.is_admin() or auth.role() = 'service_role')
  with check (public.is_admin() or auth.role() = 'service_role');

drop policy if exists crm_customers_auth on crm.customers;
create policy crm_customers_auth on crm.customers
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists crm_interactions_auth on crm.interactions;
create policy crm_interactions_auth on crm.interactions
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists templates_auth on agentes.message_templates;
create policy templates_auth on agentes.message_templates
  for all using (public.is_admin() or auth.role() = 'service_role')
  with check (public.is_admin() or auth.role() = 'service_role');

drop policy if exists campanhas_auth on marketing.campanhas;
create policy campanhas_auth on marketing.campanhas
  for all using (public.is_admin() or auth.role() = 'service_role')
  with check (public.is_admin() or auth.role() = 'service_role');

drop policy if exists campaign_sends_auth on marketing.campaign_sends;
create policy campaign_sends_auth on marketing.campaign_sends
  for all using (public.is_admin() or auth.role() = 'service_role')
  with check (public.is_admin() or auth.role() = 'service_role');

alter table reservas.reservations
  add column if not exists customer_id uuid references crm.customers(id) on delete set null;

create index if not exists reservas_reservations_customer_idx
  on reservas.reservations(customer_id, created_at desc);
