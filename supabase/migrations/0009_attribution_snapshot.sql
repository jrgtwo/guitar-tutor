-- ────────────────────────────────────────────────────────────────────────────
-- Attribution snapshot
-- ────────────────────────────────────────────────────────────────────────────
-- The shared-content viewer needs to render "Created by <display name>" to all
-- viewers, including anon. Because the profiles table is signed-in-only (and
-- gates private profiles even from signed-in viewers), reading attribution via
-- a join doesn't work.
--
-- Display names are locked-permanent at signup (see Locked Decisions), so it's
-- safe to snapshot the creator's display name onto each shareable row at write
-- time without risk of drift. New INSERTs fill the column from auth-store state;
-- this migration backfills existing rows and ensures the account-deletion RPC
-- also nulls the snapshot when orphaning shared content (so attribution flips to
-- "[Deleted User]" alongside `user_id` flipping to null).

alter table patterns
  add column if not exists created_by_display_name text;

alter table compositions
  add column if not exists created_by_display_name text;

alter table voice_presets
  add column if not exists created_by_display_name text;

-- Backfill existing rows from the current owner's profile. Rows whose owner has
-- already been deleted (user_id null) stay null and will render as [Deleted User].
update patterns p
   set created_by_display_name = prof.display_name
  from profiles prof
 where prof.user_id = p.user_id
   and p.created_by_display_name is null;

update compositions c
   set created_by_display_name = prof.display_name
  from profiles prof
 where prof.user_id = c.user_id
   and c.created_by_display_name is null;

update voice_presets v
   set created_by_display_name = prof.display_name
  from profiles prof
 where prof.user_id = v.user_id
   and v.created_by_display_name is null;

-- Account deletion cleanup: also null the snapshot for orphaned shared content,
-- matching how `user_id` is nulled. Replaces the function from 0007.
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

  -- Orphan shared content: null both the FK and the attribution snapshot.
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

  -- Caller follows up with the `delete-user` Edge Function to remove auth.users.
END;
$$;
