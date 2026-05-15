-- Multi-environment WhatsApp configuration.
-- Allows multiple integration credentials and channel configs to coexist (e.g.
-- "Production" + "Test"), with a single one flagged `is_active=true` at a time.
-- The CRM uses the active one for outbound and as the default UI environment;
-- inbound webhooks are matched by phone_number_id so any configured number can
-- still receive messages.

-- ---------------------------------------------------------------------------
-- 1. integrations: add is_active (label column already exists).
-- ---------------------------------------------------------------------------
alter table public.integrations
  add column if not exists is_active boolean not null default true;

-- One active row per (provider, workspace). workspace_id is uuid, so we
-- can't use a coalesce sentinel — split into two partial unique indexes:
-- one for workspaces with an id, one for the global (NULL workspace) row.
drop index if exists public.integrations_one_active_per_provider;
drop index if exists public.integrations_one_active_per_provider_ws;
drop index if exists public.integrations_one_active_per_provider_global;

create unique index integrations_one_active_per_provider_ws
  on public.integrations (provider, workspace_id)
  where is_active = true and workspace_id is not null;

create unique index integrations_one_active_per_provider_global
  on public.integrations (provider)
  where is_active = true and workspace_id is null;

-- ---------------------------------------------------------------------------
-- 2. whatsapp_channel_configs: add label + is_active, relax unique constraint.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_channel_configs
  add column if not exists label text;

alter table public.whatsapp_channel_configs
  add column if not exists is_active boolean not null default true;

alter table public.whatsapp_channel_configs
  add column if not exists integration_id uuid references public.integrations(id) on delete set null;

-- Drop the old uniqueness on workspace_id alone — we now allow many configs
-- per workspace, only one active.
drop index if exists public.whatsapp_channel_configs_workspace_unique;

create unique index if not exists whatsapp_channel_configs_one_active_per_workspace
  on public.whatsapp_channel_configs (workspace_id)
  where is_active = true;

-- Helpful lookup index for the webhook router (by inbound phone_number_id).
create index if not exists whatsapp_channel_configs_phone_number_idx
  on public.whatsapp_channel_configs (phone_number_id);
