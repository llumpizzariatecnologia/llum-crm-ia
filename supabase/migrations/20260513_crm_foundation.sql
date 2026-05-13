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

create table if not exists public.conversations_v2 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'ai_active',
  channel text not null default 'whatsapp',
  assigned_to text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations_v2(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  direction text not null,
  provider text not null default 'meta_whatsapp',
  provider_message_id text,
  type text not null default 'text',
  body text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  sent_by text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider_message_id)
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);

create table if not exists public.leads_v2 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid not null references public.conversations_v2(id) on delete cascade,
  status text not null default 'new',
  intent text,
  source text not null default 'whatsapp',
  score integer not null default 0,
  summary text,
  desired_date date,
  party_size integer,
  event_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations_v2(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  task text not null,
  model text,
  prompt_version text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status text not null default 'success',
  error text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.decision_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations_v2(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  intent text,
  confidence numeric(5,2),
  route text not null,
  reason text,
  created_lead_id uuid references public.leads_v2(id) on delete set null,
  sent_message_id uuid references public.messages(id) on delete set null,
  handoff_requested boolean not null default false,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  webhook_verify_token_secret_name text,
  access_token_secret_name text,
  app_secret_secret_name text,
  graph_api_version text not null default 'v20.0',
  webhook_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations_v2 enable row level security;
alter table public.messages enable row level security;
alter table public.leads_v2 enable row level security;
alter table public.ai_runs enable row level security;
alter table public.decision_logs enable row level security;
alter table public.whatsapp_settings enable row level security;

create policy if not exists tenants_authenticated_select on public.tenants
  for select using (auth.role() = 'authenticated');

create policy if not exists contacts_workspace_isolation on public.contacts
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists conversations_workspace_isolation on public.conversations_v2
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists messages_workspace_isolation on public.messages
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists leads_workspace_isolation on public.leads_v2
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists ai_runs_workspace_isolation on public.ai_runs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists decision_logs_workspace_isolation on public.decision_logs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy if not exists whatsapp_settings_workspace_isolation on public.whatsapp_settings
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
