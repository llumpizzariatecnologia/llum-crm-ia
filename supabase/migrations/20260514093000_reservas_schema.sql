create extension if not exists "pgcrypto";

create schema if not exists reservas;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'reservas' and t.typname = 'ticket_status'
  ) then
    create type reservas.ticket_status as enum ('pending', 'paid', 'free', 'expired', 'cancelled');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'reservas' and t.typname = 'ticket_category'
  ) then
    create type reservas.ticket_category as enum ('adult', 'child_6_10', 'child_under_5');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'reservas' and t.typname = 'reservation_status'
  ) then
    create type reservas.reservation_status as enum ('pending', 'partial', 'paid', 'expired', 'cancelled');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists reservas.daily_capacity (
  date date primary key,
  max_people integer not null default 100,
  is_blocked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservas.pricing_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists reservas.weekday_rules (
  weekday smallint primary key check (weekday between 0 and 6),
  weekday_name text not null,
  is_blocked boolean not null default false,
  pricing_override boolean not null default false,
  price_adult numeric(10,2),
  price_child_6_10 numeric(10,2),
  fee_per_person numeric(10,2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservas.reservations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  type text not null default 'rodizio',
  date date not null,
  adults integer not null default 0,
  children_6_10 integer not null default 0,
  children_under_5 integer not null default 0,
  total_people integer not null default 0,
  fee_amount numeric(10,2) not null default 0,
  payment_status reservas.reservation_status not null default 'pending',
  payment_provider text not null default 'mercadopago',
  mp_payment_id text,
  mp_preference_id text,
  mp_init_point text,
  qr_token text,
  birthday_date date,
  birthday_person_name text,
  notes text,
  created_by_admin boolean not null default false,
  arrived_at timestamptz,
  refunded_at timestamptz,
  refund_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservas.reservation_tickets (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservas.reservations(id) on delete cascade,
  category reservas.ticket_category not null,
  holder_name text,
  holder_phone text,
  price numeric(10,2) not null default 0,
  payment_status reservas.ticket_status not null default 'pending',
  paid_by_organizer boolean not null default false,
  link_token text unique,
  link_sent_at timestamptz,
  expires_at timestamptz,
  mp_payment_id text,
  mp_preference_id text,
  mp_init_point text,
  qr_token text,
  arrived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservas_reservations_date_idx
  on reservas.reservations(date);

create index if not exists reservas_reservations_phone_idx
  on reservas.reservations(phone);

create index if not exists reservas_reservations_status_idx
  on reservas.reservations(payment_status);

create index if not exists reservas_reservations_contact_created_idx
  on reservas.reservations(contact_id, created_at desc);

create index if not exists reservas_reservations_tenant_date_idx
  on reservas.reservations(tenant_id, date desc);

create index if not exists reservas_tickets_reservation_idx
  on reservas.reservation_tickets(reservation_id);

create index if not exists reservas_tickets_link_token_idx
  on reservas.reservation_tickets(link_token)
  where link_token is not null;

drop trigger if exists trg_reservas_daily_capacity_updated_at on reservas.daily_capacity;
create trigger trg_reservas_daily_capacity_updated_at
before update on reservas.daily_capacity
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservas_pricing_config_updated_at on reservas.pricing_config;
create trigger trg_reservas_pricing_config_updated_at
before update on reservas.pricing_config
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservas_weekday_rules_updated_at on reservas.weekday_rules;
create trigger trg_reservas_weekday_rules_updated_at
before update on reservas.weekday_rules
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservas_reservations_updated_at on reservas.reservations;
create trigger trg_reservas_reservations_updated_at
before update on reservas.reservations
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservas_tickets_updated_at on reservas.reservation_tickets;
create trigger trg_reservas_tickets_updated_at
before update on reservas.reservation_tickets
for each row execute function public.set_updated_at();

insert into reservas.pricing_config (key, value) values
  ('price_adult', '89.90'),
  ('price_child_6_10', '49.90'),
  ('reservation_fee_per_person', '5'),
  ('payment_mode', 'reservation_fee'),
  ('reservation_time', '19:00'),
  ('default_max_capacity', '430'),
  ('tolerance_minutes', '15'),
  ('late_arrival_limit_minutes', '45'),
  ('late_seat_release_value', '89.90')
on conflict (key) do nothing;

insert into reservas.weekday_rules (weekday, weekday_name) values
  (0, 'Domingo'),
  (1, 'Segunda'),
  (2, 'Terca'),
  (3, 'Quarta'),
  (4, 'Quinta'),
  (5, 'Sexta'),
  (6, 'Sabado')
on conflict (weekday) do nothing;

alter table reservas.daily_capacity enable row level security;
alter table reservas.pricing_config enable row level security;
alter table reservas.weekday_rules enable row level security;
alter table reservas.reservations enable row level security;
alter table reservas.reservation_tickets enable row level security;

drop policy if exists reservas_capacity_read on reservas.daily_capacity;
create policy reservas_capacity_read on reservas.daily_capacity
  for select using (true);

drop policy if exists reservas_capacity_auth on reservas.daily_capacity;
create policy reservas_capacity_auth on reservas.daily_capacity
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists reservas_pricing_read on reservas.pricing_config;
create policy reservas_pricing_read on reservas.pricing_config
  for select using (true);

drop policy if exists reservas_pricing_auth on reservas.pricing_config;
create policy reservas_pricing_auth on reservas.pricing_config
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists reservas_weekday_read on reservas.weekday_rules;
create policy reservas_weekday_read on reservas.weekday_rules
  for select using (true);

drop policy if exists reservas_weekday_auth on reservas.weekday_rules;
create policy reservas_weekday_auth on reservas.weekday_rules
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists reservas_reservations_auth on reservas.reservations;
create policy reservas_reservations_auth on reservas.reservations
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

drop policy if exists reservas_tickets_auth on reservas.reservation_tickets;
create policy reservas_tickets_auth on reservas.reservation_tickets
  for all using (auth.role() = 'authenticated' or auth.role() = 'service_role')
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table reservas.reservations;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table reservas.reservation_tickets;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;
