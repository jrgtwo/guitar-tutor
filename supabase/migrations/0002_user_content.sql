-- ──────────────────────────────────────────────────────────────────────────
-- 0002 — User content: patterns, compositions, voice_presets
-- ──────────────────────────────────────────────────────────────────────────
-- Each row is owned by a user, with optional sharing (private/unlisted/public)
-- and optional fork attribution via forked_from_id. Tagged-copy semantics:
-- a fork is an independent row with its own ownership; forked_from_id is
-- metadata for attribution only.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── patterns ─────────────────────────────────────────────────────────────
create table public.patterns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  name            text not null,
  data            jsonb not null,
  visibility      text not null default 'private'
                   check (visibility in ('private', 'unlisted', 'public')),
  forked_from_id  uuid references public.patterns(id) on delete set null,
  orphaned        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index patterns_user_id_idx
  on public.patterns (user_id, updated_at desc)
  where user_id is not null;

create index patterns_visibility_idx
  on public.patterns (visibility)
  where visibility != 'private';

alter table public.patterns enable row level security;

create policy "patterns_read_own_or_shared" on public.patterns
  for select
  using (
    auth.uid() = user_id
    or visibility != 'private'
  );

create policy "patterns_insert_own" on public.patterns
  for insert
  with check (auth.uid() = user_id);

create policy "patterns_update_own" on public.patterns
  for update
  using (auth.uid() = user_id);

create policy "patterns_delete_own" on public.patterns
  for delete
  using (auth.uid() = user_id);

-- ─── compositions ─────────────────────────────────────────────────────────
create table public.compositions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  name            text not null,
  data            jsonb not null,
  visibility      text not null default 'private'
                   check (visibility in ('private', 'unlisted', 'public')),
  forked_from_id  uuid references public.compositions(id) on delete set null,
  orphaned        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index compositions_user_id_idx
  on public.compositions (user_id, updated_at desc)
  where user_id is not null;

create index compositions_visibility_idx
  on public.compositions (visibility)
  where visibility != 'private';

alter table public.compositions enable row level security;

create policy "compositions_read_own_or_shared" on public.compositions
  for select
  using (
    auth.uid() = user_id
    or visibility != 'private'
  );

create policy "compositions_insert_own" on public.compositions
  for insert
  with check (auth.uid() = user_id);

create policy "compositions_update_own" on public.compositions
  for update
  using (auth.uid() = user_id);

create policy "compositions_delete_own" on public.compositions
  for delete
  using (auth.uid() = user_id);

-- ─── voice_presets ────────────────────────────────────────────────────────
create table public.voice_presets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  name            text not null,
  instrument_id   text not null,
  family          text not null,
  data            jsonb not null,
  visibility      text not null default 'private'
                   check (visibility in ('private', 'unlisted', 'public')),
  forked_from_id  uuid references public.voice_presets(id) on delete set null,
  orphaned        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index voice_presets_user_id_idx
  on public.voice_presets (user_id, instrument_id, family)
  where user_id is not null;

create index voice_presets_visibility_idx
  on public.voice_presets (visibility)
  where visibility != 'private';

alter table public.voice_presets enable row level security;

create policy "voice_presets_read_own_or_shared" on public.voice_presets
  for select
  using (
    auth.uid() = user_id
    or visibility != 'private'
  );

create policy "voice_presets_insert_own" on public.voice_presets
  for insert
  with check (auth.uid() = user_id);

create policy "voice_presets_update_own" on public.voice_presets
  for update
  using (auth.uid() = user_id);

create policy "voice_presets_delete_own" on public.voice_presets
  for delete
  using (auth.uid() = user_id);
