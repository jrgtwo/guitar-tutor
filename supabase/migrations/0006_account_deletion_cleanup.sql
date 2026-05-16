-- ────────────────────────────────────────────────────────────────────────────
-- Account Deletion Cleanup RPC
-- ────────────────────────────────────────────────────────────────────────────

-- This function performs all the complex data cleanup and orphaning
-- required when a user deletes their account. It is SECURITY DEFINER
-- to allow it to modify rows that the user might not have direct 
-- UPDATE access to (like orphaning shared content).

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

  -- 2. Orphan Shared Content
  -- Patterns
  UPDATE patterns
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  -- Compositions
  UPDATE compositions
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  -- Voice Presets
  UPDATE voice_presets
  SET user_id = NULL
  WHERE user_id = v_user_id AND visibility != 'private';

  -- 3. Teacher / Student Relationship Cleanup
  -- If the user was a student, preserve the relationship but mark as deleted
  UPDATE teacher_student_relationships
  SET student_deleted = true,
      student_id = NULL
  WHERE student_id = v_user_id;

  -- 4. Assignments & Notes
  -- Mark assignments owned by the teacher as orphaned
  UPDATE assignments
  SET orphaned = true
  WHERE teacher_id = v_user_id;

  -- Anonymize notes authored by the user
  UPDATE assignment_notes
  SET author_id = NULL
  WHERE author_id = v_user_id;

  -- 5. Hard Delete Private Data
  DELETE FROM profiles WHERE user_id = v_user_id;
  DELETE FROM user_settings WHERE user_id = v_user_id;
  DELETE FROM subscriptions WHERE user_id = v_user_id;
  
  -- Private patterns
  DELETE FROM patterns WHERE user_id = v_user_id AND visibility = 'private';
  -- Private compositions
  DELETE FROM compositions WHERE user_id = v_user_id AND visibility = 'private';
  -- Private voice presets
  DELETE FROM voice_presets WHERE user_id = v_user_id AND visibility = 'private';

  -- 6. Note: The calling client or a background job 
  -- must now call the Supabase Admin API to delete the auth.users entry.
END;
$$;
