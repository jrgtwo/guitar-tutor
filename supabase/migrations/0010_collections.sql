-- ────────────────────────────────────────────────────────────────────────────
-- Collections (nested folders for shareable content)
-- ────────────────────────────────────────────────────────────────────────────
-- Folders are kind-agnostic: a single `collections` table holds folder rows
-- that can contain patterns, compositions, and voice presets. Each item table
-- gets a `collection_id` FK; null means "library root."
--
-- Visibility model mirrors patterns exactly: private / unlisted / public, with
-- `published_at` set when leaving private and a denormalized attribution snapshot
-- (`created_by_display_name`) so anon viewers can read attribution without
-- joining the auth-gated profiles table.
--
-- Folder visibility and item visibility are two INDEPENDENT permission gates:
--   - folder visibility controls whether a viewer can navigate to the folder URL
--     and see its listing
--   - item visibility controls whether a viewer can see a specific item, in a
--     listing OR via direct link
-- These gates don't compose in complex ways — each visibility check is local.
--
-- FK behavior:
--   - collections.user_id ON DELETE SET NULL — orphans on account deletion,
--     same as patterns/compositions
--   - collections.parent_id ON DELETE SET NULL — subfolders bubble to root when
--     parent deleted, preserving the user's content. App-level "delete with
--     contents" handles recursive deletion explicitly.
--   - <items>.collection_id ON DELETE SET NULL — items survive at root when
--     their containing folder is deleted, preserving the user's content.

create table public.collections (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete set null,
  parent_id                uuid references public.collections(id) on delete set null,
  name                     text not null,
  visibility               text not null default 'private',
  created_by_display_name  text,
  published_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index collections_user_idx
  on public.collections (user_id, updated_at desc)
  where user_id is not null;
create index collections_parent_idx
  on public.collections (parent_id);
create index collections_catalog_idx
  on public.collections (visibility, published_at desc)
  where visibility != 'private';

alter table public.patterns
  add column if not exists collection_id uuid references public.collections(id) on delete set null;
alter table public.compositions
  add column if not exists collection_id uuid references public.collections(id) on delete set null;
alter table public.voice_presets
  add column if not exists collection_id uuid references public.collections(id) on delete set null;

create index if not exists patterns_collection_idx
  on public.patterns (collection_id) where collection_id is not null;
create index if not exists compositions_collection_idx
  on public.compositions (collection_id) where collection_id is not null;
create index if not exists voice_presets_collection_idx
  on public.voice_presets (collection_id) where collection_id is not null;

-- RLS: same shape as patterns. Owner sees everything; anyone reads non-private.
alter table public.collections enable row level security;

create policy "collections_read_own_or_shared" on public.collections
  for select
  using (
    auth.uid() = user_id
    or visibility != 'private'
  );

create policy "collections_insert_own" on public.collections
  for insert
  with check (auth.uid() = user_id);

create policy "collections_update_own" on public.collections
  for update
  using (auth.uid() = user_id);

create policy "collections_delete_own" on public.collections
  for delete
  using (auth.uid() = user_id);

-- Account deletion cleanup: handle collections alongside patterns / compositions /
-- voice presets. Replaces the function from 0009.
CREATE OR REPLACE FUNCTION delete_account_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Orphan shared content (patterns / compositions / voice presets / collections).
  UPDATE patterns
     SET user_id = NULL,
         created_by_display_name = NULL
   WHERE user_id = v_user_id AND visibility != 'private';

  UPDATE compositions
     SET user_id = NULL,
         created_by_display_name = NULL
   WHERE user_id = v_user_id AND visibility != 'private';

  UPDATE voice_presets
     SET user_id = NULL,
         created_by_display_name = NULL
   WHERE user_id = v_user_id AND visibility != 'private';

  UPDATE collections
     SET user_id = NULL,
         created_by_display_name = NULL
   WHERE user_id = v_user_id AND visibility != 'private';

  -- Teacher/student relationship cleanup: archive aggregates, mark deleted.
  UPDATE teacher_student_relationships r
     SET archived_assignment_count  = sub.total_count,
         archived_completed_count   = sub.completed_count,
         archived_first_activity_at = sub.first_activity,
         archived_last_activity_at  = sub.last_activity,
         student_deleted            = true,
         student_id                 = NULL
    FROM (
      SELECT r2.id AS relationship_id,
             COUNT(ar.*)                                                AS total_count,
             COUNT(ar.*) FILTER (WHERE ar.status = 'complete')          AS completed_count,
             MIN(COALESCE(ar.started_at, ar.assigned_at))               AS first_activity,
             MAX(COALESCE(ar.completed_at, ar.started_at, ar.assigned_at)) AS last_activity
        FROM teacher_student_relationships r2
        LEFT JOIN assignments a
          ON a.teacher_id = r2.teacher_id
        LEFT JOIN assignment_recipients ar
          ON ar.assignment_id = a.id
         AND ar.student_id = v_user_id
       WHERE r2.student_id = v_user_id
       GROUP BY r2.id
    ) sub
   WHERE r.id = sub.relationship_id;

  UPDATE assignments
     SET orphaned = true
   WHERE teacher_id = v_user_id;

  UPDATE assignment_notes
     SET author_id = NULL
   WHERE author_id = v_user_id;

  -- Hard-delete private data.
  DELETE FROM profiles      WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;
  DELETE FROM subscriptions WHERE user_id = v_user_id;

  DELETE FROM patterns      WHERE user_id = v_user_id AND visibility = 'private';
  DELETE FROM compositions  WHERE user_id = v_user_id AND visibility = 'private';
  DELETE FROM voice_presets WHERE user_id = v_user_id AND visibility = 'private';
  DELETE FROM collections   WHERE user_id = v_user_id AND visibility = 'private';

  -- Caller follows up with the `delete-user` Edge Function to remove auth.users.
END;
$$;
