create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  section_title text,
  page_start integer,
  page_end integer,
  token_estimate integer not null default 0,
  content text not null,
  summary text,
  tags jsonb not null default '[]'::jsonb,
  embedding vector(1536),
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists knowledge_chunks_document_chunk_idx
  on public.knowledge_chunks(document_id, chunk_index);

create index if not exists knowledge_chunks_workspace_status_idx
  on public.knowledge_chunks(workspace_id, status, updated_at desc);

create index if not exists knowledge_chunks_tags_gin_idx
  on public.knowledge_chunks using gin(tags);

create index if not exists knowledge_chunks_content_fts_idx
  on public.knowledge_chunks
  using gin (to_tsvector('portuguese', coalesce(section_title, '') || ' ' || content));

create index if not exists knowledge_chunks_embedding_ivfflat_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  query_workspace_id text,
  match_count integer default 5
)
returns table (
  id uuid,
  document_id uuid,
  title text,
  category text,
  summary text,
  section_title text,
  content text,
  score double precision,
  tags jsonb
)
language sql
stable
as $$
  select
    kc.id,
    kc.document_id,
    kd.title,
    kd.category,
    coalesce(kc.summary, kd.summary) as summary,
    kc.section_title,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as score,
    kc.tags
  from public.knowledge_chunks kc
  join public.knowledge_documents kd
    on kd.id = kc.document_id
  where kc.workspace_id = query_workspace_id
    and kd.workspace_id = query_workspace_id
    and kc.status = 'published'
    and kd.status = 'published'
    and kc.embedding is not null
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table public.knowledge_chunks enable row level security;

drop policy if exists knowledge_chunks_workspace_isolation on public.knowledge_chunks;
create policy knowledge_chunks_workspace_isolation on public.knowledge_chunks
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
