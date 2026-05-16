-- ────────────────────────────────────────────────────────────────────────────
-- Teacher-student relationship: aggregate stats preservation
-- ────────────────────────────────────────────────────────────────────────────
-- When a student deletes their account, their assignment_recipients rows
-- cascade-delete with auth.users. The doc requires preserving aggregate
-- stats on the relationship row so the teacher roster can still show
-- "[Deleted User #abcd] — completed 5 of 7 assignments" after deletion.
--
-- This migration:
--   1. Adds aggregate stats columns to teacher_student_relationships.
--   2. Replaces delete_account_cleanup() to compute those aggregates
--      before the cascade.

alter table teacher_student_relationships
  add column if not exists archived_assignment_count   int,
  add column if not exists archived_completed_count    int,
  add column if not exists archived_first_activity_at  timestamptz,
  add column if not exists archived_last_activity_at   timestamptz;


CREATE OR REPLACE FUNCTION delete_account_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- 1. Identify the user from the session (prevents hijacking)
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Orphan shared content
  UPDATE patterns
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  UPDATE compositions
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  UPDATE voice_presets
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  -- 3. Teacher / student relationship cleanup
  -- If the user was a student, archive aggregate stats onto the relationship
  -- row before assignment_recipients cascades away with auth.users.
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

  -- 4. Assignments & notes
  UPDATE assignments
  SET orphaned = true
  WHERE teacher_id = v_user_id;

  UPDATE assignment_notes
  SET author_id = NULL
  WHERE author_id = v_user_id;

  -- 5. Hard-delete private data
  DELETE FROM profiles      WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;
  DELETE FROM subscriptions WHERE user_id = v_user_id;

  DELETE FROM patterns        WHERE user_id = v_user_id AND visibility = 'private';
  DELETE FROM compositions    WHERE user_id = v_user_id AND visibility = 'private';
  DELETE FROM voice_presets   WHERE user_id = v_user_id AND visibility = 'private';

  -- 6. Note: caller must follow up by invoking the `delete-user` Edge Function,
  -- which uses the service role to remove the auth.users row.
END;
$$;
