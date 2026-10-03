-- Generated content cache with embeddings for dedup and close-feedback.
create table if not exists public.generated_content (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  game_type text not null,
  difficulty text not null default 'medium',
  name text not null,
  normalized text not null,
  aliases text[] not null default '{}',
  category text,
  forbidden text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  embedding vector(384),
  source text not null check (source in ('external', 'ai', 'seed')),
  provider text,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  times_used int not null default 0,
  unique (theme, game_type, fingerprint)
);

create index if not exists generated_content_normalized_trgm
  on public.generated_content using gin (normalized gin_trgm_ops);

create index if not exists generated_content_expires_idx
  on public.generated_content (expires_at)
  where expires_at is not null;

-- HNSW index for cosine similarity search (built after content exists).
create index if not exists generated_content_embedding_idx
  on public.generated_content
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Drives uniqueness within a session.
create table if not exists public.session_content_usage (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  content_id uuid not null references public.generated_content (id) on delete cascade,
  fingerprint text not null,
  used_at timestamptz not null default now(),
  primary key (session_id, content_id)
);

-- AI evaluations for Blind Ranking and Auction (async, after scoring).
create table if not exists public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('blind_ranking', 'auction')),
  input_hash text not null,
  output jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'fallback', 'failed')),
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_evaluations_session_idx on public.ai_evaluations (session_id);
