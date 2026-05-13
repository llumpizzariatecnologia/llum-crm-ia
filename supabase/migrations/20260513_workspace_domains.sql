create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  name text not null,
  description text,
  assistant_name text not null,
  tone text not null,
  system_prompt text not null,
  business_context text not null,
  handoff_message text not null,
  model text not null default 'gpt-4.1-mini',
  temperature numeric(3,2) not null default 0.2,
  ai_enabled boolean not null default true,
  handoff_on_unknown boolean not null default true,
  max_response_chars integer not null default 420,
  status text not null default 'draft',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_profiles_workspace_idx
  on public.agent_profiles(workspace_id, updated_at desc);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  title text not null,
  category text not null,
  source_type text not null default 'custom',
  content text not null,
  summary text,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  version integer not null default 1,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_documents_workspace_idx
  on public.knowledge_documents(workspace_id, status, updated_at desc);

create table if not exists public.whatsapp_channel_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  display_name text not null,
  phone_number_id text not null,
  waba_id text not null,
  webhook_url text,
  graph_api_version text not null default 'v20.0',
  verified_name text,
  quality_rating text,
  status text not null default 'draft',
  connected_at timestamptz,
  last_healthcheck_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_channel_configs_workspace_unique
  on public.whatsapp_channel_configs(workspace_id);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  name text not null,
  meta_name text not null,
  category text not null default 'utility',
  language text not null default 'pt_BR',
  status text not null default 'draft',
  header_type text not null default 'none',
  header_text text,
  body_text text not null,
  footer_text text,
  buttons jsonb not null default '[]'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  sample_payload jsonb not null default '{}'::jsonb,
  compliance_notes text,
  last_submission_at timestamptz,
  last_review_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_templates_workspace_idx
  on public.whatsapp_templates(workspace_id, status, updated_at desc);

alter table public.agent_profiles enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.whatsapp_channel_configs enable row level security;
alter table public.whatsapp_templates enable row level security;

drop policy if exists agent_profiles_workspace_isolation on public.agent_profiles;
create policy agent_profiles_workspace_isolation on public.agent_profiles
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists knowledge_documents_workspace_isolation on public.knowledge_documents;
create policy knowledge_documents_workspace_isolation on public.knowledge_documents
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists whatsapp_channel_configs_workspace_isolation on public.whatsapp_channel_configs;
create policy whatsapp_channel_configs_workspace_isolation on public.whatsapp_channel_configs
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists whatsapp_templates_workspace_isolation on public.whatsapp_templates;
create policy whatsapp_templates_workspace_isolation on public.whatsapp_templates
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
