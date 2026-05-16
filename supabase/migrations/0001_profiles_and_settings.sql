-- ──────────────────────────────────────────────────────────────────────────
-- 0001 — Profiles and user settings
-- ──────────────────────────────────────────────────────────────────────────
-- Every authenticated user has exactly one row in each of these tables.
-- profiles holds user-entered identity (display name, avatar, bio, etc).
-- user_settings holds per-user app preferences (active voice presets, reverb,
-- walkthrough flags).
--
-- All user content (patterns, compositions, voice_presets, assignments)
-- references auth.users(id) directly, NOT profiles.user_id — so a profile
-- being soft-deleted (deleted = true) doesn't break content joins.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null,
  user_types            text[] not null default '{}',
  avatar_url            text,
  bio                   text,
  pronouns              text,
  external_link         text,
  social_handles        jsonb not null default '{}'::jsonb,
  instruments           text[] not null default '{}',
  years_playing         int,
  skill_level           text,
  genres                text[] not null default '{}',
  available_for_lessons boolean not null default false,
  looking_for_teacher   boolean not null default false,
  profile_public        boolean not null default true,
  deleted               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Case-insensitive uniqueness on display_name so "FooUser" and "foouser" collide.
create unique index profiles_display_name_lower_idx
  on public.profiles (lower(display_name))
  where deleted = false;

alter table public.profiles enable row level security;

-- Anyone signed-in can read any profile that's public, plus their own (even if private).
create policy "profiles_read_public_or_own" on public.profiles
  for select
  using (
    auth.role() = 'authenticated'
    and (profile_public = true or user_id = auth.uid())
  );

create policy "profiles_insert_own" on public.profiles
  for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = user_id);

-- Delete is handled by cascade from auth.users.

-- ─── user_settings ────────────────────────────────────────────────────────
create table public.user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_presets   jsonb not null default '{}'::jsonb,
  reverb           jsonb,
  walkthrough_seen jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_all_own" on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
