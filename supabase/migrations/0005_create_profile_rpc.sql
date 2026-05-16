-- ──────────────────────────────────────────────────────────────────────────
-- 0005 — create_profile_with_settings RPC
-- ──────────────────────────────────────────────────────────────────────────
-- Atomically inserts the profile, user_settings singleton, and subscriptions
-- (tier='free') rows for a newly-authenticated user. Called from the client
-- on signup-form submit.
--
-- security definer so it can bypass RLS for the writes it needs to do, with
-- guards inside (uses auth.uid() — caller can only create rows for themselves).
--
-- Returns the new profile row so the client doesn't need a follow-up SELECT.
-- ──────────────────────────────────────────────────────────────────────────

create or replace function public.create_profile_with_settings(
  p_display_name           text,
  p_user_types             text[],
  p_avatar_url             text default null,
  p_bio                    text default null,
  p_pronouns               text default null,
  p_external_link          text default null,
  p_social_handles         jsonb default '{}'::jsonb,
  p_instruments            text[] default '{}',
  p_years_playing          int default null,
  p_skill_level            text default null,
  p_genres                 text[] default '{}',
  p_available_for_lessons  boolean default false,
  p_looking_for_teacher    boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Trim & basic validation. The unique index on lower(display_name) raises
  -- a UNIQUE violation (Postgres error 23505) on a collision; the client
  -- should catch and present "name taken".
  if length(trim(p_display_name)) = 0 then
    raise exception 'display_name required';
  end if;
  if array_length(p_user_types, 1) is null then
    raise exception 'at least one user_type required';
  end if;

  insert into public.profiles (
    user_id, display_name, user_types,
    avatar_url, bio, pronouns, external_link, social_handles,
    instruments, years_playing, skill_level, genres,
    available_for_lessons, looking_for_teacher
  )
  values (
    v_uid, trim(p_display_name), p_user_types,
    p_avatar_url, p_bio, p_pronouns, p_external_link, p_social_handles,
    p_instruments, p_years_playing, p_skill_level, p_genres,
    p_available_for_lessons, p_looking_for_teacher
  )
  returning * into v_profile;

  -- Singleton settings row.
  insert into public.user_settings (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  -- Default free-tier subscription.
  insert into public.subscriptions (user_id, tier)
  values (v_uid, 'free')
  on conflict (user_id) do nothing;

  return v_profile;
end;
$$;

-- Authenticated users can invoke. (RLS doesn't apply to function execution
-- itself; we guard via auth.uid() above.)
grant execute on function public.create_profile_with_settings(
  text, text[], text, text, text, text, jsonb,
  text[], int, text, text[], boolean, boolean
) to authenticated;
