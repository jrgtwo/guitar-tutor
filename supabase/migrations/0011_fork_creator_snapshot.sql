-- 0011 — Fork creator snapshot.
--
-- When a user forks a public row, we already capture `forked_from_id` pointing
-- at the source. To display "Forked from <Name>" without a join (and without
-- breaking when the source is later made private or deleted), denormalize the
-- source row's `created_by_display_name` into a new column on the fork.
--
-- Same pattern as 0009 (`created_by_display_name`) — pure snapshot, never
-- mutated after the row is inserted.

alter table public.patterns
  add column if not exists forked_from_creator_name text;

alter table public.compositions
  add column if not exists forked_from_creator_name text;

alter table public.voice_presets
  add column if not exists forked_from_creator_name text;
