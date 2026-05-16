-- ────────────────────────────────────────────────────────────────────────────
-- Catalog-forward metadata
-- ────────────────────────────────────────────────────────────────────────────
-- Pre-launch migration. Truncates patterns + compositions (no real data yet)
-- so we can add `instrument_id NOT NULL` cleanly. See
-- docs/supabase-integration.md → "Catalog-forward metadata".

truncate table patterns, compositions cascade;

-- ── patterns ──────────────────────────────────────────────────────────────
alter table patterns
  add column description    text,
  add column difficulty     text,                       -- 'beginner' | 'intermediate' | 'advanced'
  add column genres         text[] not null default '{}',
  add column tags           text[] not null default '{}',
  add column instrument_id  text not null,
  add column published_at   timestamptz;

create index patterns_catalog_idx on patterns
  (visibility, instrument_id, difficulty, published_at desc)
  where visibility != 'private';
create index patterns_tags_gin    on patterns using gin (tags)   where visibility != 'private';
create index patterns_genres_gin  on patterns using gin (genres) where visibility != 'private';

-- ── compositions ──────────────────────────────────────────────────────────
alter table compositions
  add column description    text,
  add column difficulty     text,
  add column genres         text[] not null default '{}',
  add column tags           text[] not null default '{}',
  add column instrument_id  text not null,
  add column published_at   timestamptz;

create index compositions_catalog_idx on compositions
  (visibility, instrument_id, difficulty, published_at desc)
  where visibility != 'private';
create index compositions_tags_gin    on compositions using gin (tags)   where visibility != 'private';
create index compositions_genres_gin  on compositions using gin (genres) where visibility != 'private';

-- ── voice_presets (instrument_id already exists, NOT NULL) ────────────────
alter table voice_presets
  add column description    text,
  add column difficulty     text,
  add column genres         text[] not null default '{}',
  add column tags           text[] not null default '{}',
  add column published_at   timestamptz;

create index voice_presets_catalog_idx on voice_presets
  (visibility, instrument_id, difficulty, published_at desc)
  where visibility != 'private';
create index voice_presets_tags_gin    on voice_presets using gin (tags)   where visibility != 'private';
create index voice_presets_genres_gin  on voice_presets using gin (genres) where visibility != 'private';
