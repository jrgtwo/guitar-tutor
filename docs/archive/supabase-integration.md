# Supabase Integration — Auth, Cloud Persistence, Sharing, Teaching, Monetization

A long-running implementation effort. Use the **Implementation Checklist** section near the end as the operational todo list — check items off as you complete them. The rest of the doc is the rationale and reference you can return to when the checklist needs context.

---

## Current status (last touched 2026-05-16)

| Group | State | Notes |
|---|---|---|
| A — Foundation (client, env, OAuth) | ✅ Done |  |
| B — Database schema | ✅ Done | Migrations 0001–0009 applied. Manual RLS verification still optional. |
| C — Auth state + sign-in UX | ✅ Done | Modal, button, user menu, signup form, RPC. ProfilePage (read-only) jumped ahead from Group G. |
| D — Anon → signed-in migration | ✅ Done | sessionStorage swap + migration prompt + migration-done flag fix. |
| E — Patterns/Compositions cloud sync | ✅ Done | Diff-sync, hydration, sign-out cleanup. UUIDs for DB-bound IDs. |
| F.1 — Sound Lab cloud sync | ✅ Done | Storage swap, hydration, lab override sync, migration prompt extension. Migration-deferred-hydration fix. |
| F.2 — Multi-variant Sound Lab UI | ✅ Done | Per-instrument variants with shared folder picker mounted on Practice / Patterns / Sound Lab. Defaults are read-only; lab edits require explicit Save / Save-as. Tier cap (20 variants on Free) is enforced. Catalog page (`?page=catalog`) shipped as part of this work. Variant Export/Import, admin-gated default preset publishing, and tunings for the 4 non-acoustic-guitar defaults remain follow-ups. |
| G — Sharing, forking, profile editor, account deletion | ✅ Done | Account deletion (RPC + Edge Function), profile editor at `?settings=1`, catalog metadata schema, sidebar-free patterns page with top controls bar + metadata popover, auto-seed drafts, shared pattern viewer at `?pattern=<uuid>`, denormalized attribution, fork action, visibility-aware delete confirm, SPA in-app navigation. Composition / voice-preset viewers still deferred (data model ready). |
| H — Library organization (collections / folders) | ✅ MVP | **Pivoted away from teacher/student workflows.** Migration 0010 + nested-folder data model (kind-agnostic), tree navigation in the picker (breadcrumb + create folder + create in current folder). Row actions (rename / move / delete with confirm) and folder-share viewer route deferred to a later polish pass. Original teacher/student spec parked — revisit on top of collections + access codes when ready. |
| I — Help button + per-page walkthroughs | ⏳ Deferred (post-UI-polish) | Waiting until UI surfaces stabilize so walkthroughs don't get rewritten every polish pass. |
| J — Monetization tier scaffolding | ✅ Done (billing deferred) | Free / Pro tiers with 200 patterns / 100 compositions / 20 voice variants caps. `gateCreate` (in `lib/src/subscription/gate.ts`) enforces on pattern create / duplicate / fork / auto-seed, composition create, and voice-variant create. Anon → SignupModal at cap; signed-in → UpgradePrompt. Stripe wiring, real upgrade flow, feature-gating for Pro-only features, and a TierBadge UI are all deferred until Pro has real unlocks. |
| K — Final verification & cleanup | ⏳ Pending | Manual E2E flows + automated tests + legacy-localStorage shim removal + doc consolidation. |

**Where to pick up next:** Group K — verification + cleanup pass.

**Start tomorrow with:** the Group K checklist near the bottom of this doc needs a refresh first — several items reference the old teacher/student flow (e.g. "Teacher / student E2E," ghost-student stats) which the Group H pivot made obsolete, and new items belong in the list (collections sync verification, the catalog migrations 0008–0010 cross-device test, attribution snapshot smoke, tier-cap behavior at boundary values). Re-scope K, then execute it. After that, the "Deferred (need to do)" lists at the end of Groups G / H / I / J are the queue for the post-MVP polish phase.

---

## Context

The app is currently entirely client-side. User content (patterns, compositions, Sound Lab voice overrides) lives in `localStorage`, which has three problems:

1. **Public-computer leak** — an anonymous user on a shared device leaves their content on disk for the next visitor.
2. **No cross-device continuity** — patterns made at home aren't on the iPad.
3. **No social or pedagogical workflows** — there's no way to share, fork, teach, or assign.

We have a Supabase project (`fret-work-main`, id `ssszubkbregwjgkrpqop`). This work adds auth, cloud persistence, sharing, teacher/student workflows, multi-preset Sound Lab, and a monetization tier model.

This is a substantial effort spanning many areas. The plan is staged with clear milestones; nothing here is meant to ship in a single PR.

---

## Personas served

The app is a multi-persona product. Architecture and feature design must accommodate all of these simultaneously, not optimize for any one:

1. **The Practicer** — uses the existing fretboard/metronome/playback. May not sign up. Anon = preview mode.
2. **The Personal Composer** — creates patterns and compositions for their own practice. Wants library to survive across devices.
3. **The Prolific Sharer** — creates content and shares it publicly. Cares about discoverability, attribution, forking.
4. **The Teacher** — builds patterns/compositions as lesson plans and pushes them to specific students. Sees student progress.
5. **The Student** — receives assignments from a teacher. Has an inbox of assigned content.

A single user is often more than one persona at different times. UI affordances should not gate based on persona.

---

## Locked decisions (summary)

| Decision | Choice |
|---|---|
| Initial auth provider | Google OAuth |
| Provider coupling | Architecture is provider-agnostic; never read provider-specific fields in domain code |
| Anon participation | Preview mode — full demo of the app with sessionStorage backing. Signup CTA modal on any account-gated action. |
| Signed-in persistence | Supabase Postgres with RLS (`auth.uid() = user_id`) |
| Anon → signed-in | Migration prompt at signup: "You made N patterns / M compositions / K voice variants during this session. Add them to your account?" All-or-nothing. Blocking modal. |
| Sign-out semantics | Clear in-memory state, clear sessionStorage, clear cached cloud data, transport stops |
| Naming conflicts on import | Imported items keep their names; cloud accepts duplicates (uniqueness by id) |
| Profile data source | User-entered at signup; nothing pre-populated from the auth provider |
| Display name | Unique across system; permanent; not editable after signup |
| Email | Auth-side only; never displayed in UI; only used for transactional/system messaging |
| User type | Multi-select required at signup; purely informational; no feature gating; editable later |
| Profile visibility | Public by default; private toggle hides the profile page only (shared content stays attributed via non-clickable display name) |
| Onboarding | No forced flows. Help button per page exposes optional walkthroughs + page-specific docs. Settings toggle for global walkthrough preference. |
| Forks | Tagged-copy semantics: forks are independent copies with a `forked_from_id` for attribution. Fully editable by the fork owner. |
| Assignments | Their own first-class entity. Bundle of pattern/composition snapshots. Per-recipient due dates and progress. |
| Teacher-student linking | Invite-only (email or invite link). Mutual opt-in. Either side can end the relationship. **No public teacher directory.** |
| Communication | Scoped notes on assignment-recipient rows only. No general DMs. Async. Length-limited. Report/block buttons. |
| Sound Lab | Migrates to per-user cloud + expands to multiple saved voice preset variants per (instrument, family). |
| Monetization tiers | Free → Pro → Teacher (linear additive). Gates on creation capacity (library caps), not consumption (browse/fork are free). |
| Account deletion | Immediate hard-delete of private content + account; shared content stays orphaned with "Created by [Deleted User]" attribution; teacher-sent assignments orphan but remain readable; student deletion preserves anonymized aggregate stats in teacher roster. |
| Notes after account deletion | Body preserved, author shown as "[Deleted User]" |
| Session lifecycle | Supabase defaults — 1h JWT, 30d refresh, silent refresh, sliding window |
| Catalog-forward metadata | Every shared row carries `description`, `difficulty`, `genres`, `tags`, `instrument_id`, `published_at`. User-typed fields are captured at authoring time so the eventual catalog page has data to filter on. Stored as plain `text` / `text[]`; no Postgres ENUMs (project convention). |
| Genres / tags vocabulary | Curated lists exported from lib code (not free-form, not DB enums). Genres = musical style; tags = pattern role/context (solo, backing-track, intro, …). Exact word lists deferred. |
| Patterns page layout | No sidebars in fretboard views. Pattern library + metadata + visibility all live in a single full-width top-controls bar above the editor. |
| Top-controls-bar interaction | Closed bar = read-only summary (one giant button). Click → single popover containing all editable fields, parity with the practice page's `HeadstockMenu`. Inside the popover, the name field doubles as the pattern picker. |
| Empty-state in editor | Auto-seed an in-memory "Untitled" draft on page load so the user can start authoring immediately. Persist (insert DB row, add to library) only on the first real edit. |

## Design Decisions

**Profile vs. Profile Settings separation**: To maintain a clear distinction between a **Public View** (read-only profile page for others) and a **Private Command Center** (management dashboard for the owner), the implementation uses two separate routes: `/?profile=<name>` and `?settings=1`. This prevents complex conditional rendering within a single component and maintains a clean separation of concerns. A 'Edit Profile' button on the Public View will link to the Private View.

---

## Database schema

All tables reference `auth.users.id` (UUID). RLS enabled on every table with policies enforcing `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE on user-owned rows.

```sql
-- ────────────────────────────────────────────────────────────────────────────
-- Profiles
-- ────────────────────────────────────────────────────────────────────────────
create table profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null unique,                              -- permanent, set at signup
  user_types     text[] not null default '{}',                      -- multi-select tags
  avatar_url     text,
  bio            text,
  pronouns       text,
  external_link  text,
  social_handles jsonb default '{}'::jsonb,                          -- { instagram: '...', youtube: '...', ... }
  instruments    text[] default '{}',                                -- ['guitar', 'bass', 'ukulele']
  years_playing  int,
  skill_level    text,                                               -- 'beginner' | 'intermediate' | 'advanced'
  genres         text[] default '{}',
  available_for_lessons boolean default false,
  looking_for_teacher   boolean default false,
  profile_public boolean default true,                               -- false = private; hides profile page
  deleted        boolean default false,                              -- soft-delete flag for orphan attribution
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index profiles_display_name_lower_idx on profiles (lower(display_name));

-- ────────────────────────────────────────────────────────────────────────────
-- Patterns
-- ────────────────────────────────────────────────────────────────────────────
create table patterns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  data            jsonb not null,                                   -- full Pattern object
  visibility      text not null default 'private',                  -- 'private' | 'unlisted' | 'public'
  forked_from_id  uuid references patterns(id) on delete set null,  -- tagged-copy attribution
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index patterns_user_id_idx on patterns (user_id, updated_at desc);
create index patterns_visibility_idx on patterns (visibility) where visibility != 'private';

-- ────────────────────────────────────────────────────────────────────────────
-- Compositions
-- ────────────────────────────────────────────────────────────────────────────
create table compositions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  data            jsonb not null,                                   -- full Composition (with placement snapshots)
  visibility      text not null default 'private',
  forked_from_id  uuid references compositions(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index compositions_user_id_idx on compositions (user_id, updated_at desc);
create index compositions_visibility_idx on compositions (visibility) where visibility != 'private';

-- ────────────────────────────────────────────────────────────────────────────
-- Voice presets (user-saved Sound Lab variants)
-- ────────────────────────────────────────────────────────────────────────────
create table voice_presets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  instrument_id   text not null,                                    -- 'guitar' | 'bass' | 'ukulele'
  family          text not null,                                    -- 'acoustic' | 'electric'
  data            jsonb not null,                                   -- full VoicePreset
  visibility      text not null default 'private',
  forked_from_id  uuid references voice_presets(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index voice_presets_user_id_idx on voice_presets (user_id, instrument_id, family);

-- ────────────────────────────────────────────────────────────────────────────
-- User settings (singleton per user)
-- ────────────────────────────────────────────────────────────────────────────
create table user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_presets   jsonb not null default '{}'::jsonb,             -- { 'guitar-acoustic': <preset uuid>, ... }
  reverb           jsonb,
  walkthrough_seen jsonb not null default '{}'::jsonb,             -- { 'patterns': true, ... }
  updated_at       timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Teacher-student relationships
-- ────────────────────────────────────────────────────────────────────────────
create table teacher_student_relationships (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references auth.users(id) on delete cascade,
  student_id    uuid references auth.users(id) on delete set null,  -- nullable for pre-signup invites + post-deletion ghosting
  invite_email  text,                                                -- set when invite hasn't been claimed yet
  invite_token  text unique,                                         -- for invite link mechanism
  status        text not null default 'pending',                     -- 'pending' | 'active' | 'ended'
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  ended_at      timestamptz,
  student_deleted boolean default false,                              -- when true, student_id is sentinel; preserve aggregate stats
  constraint either_student_or_invite check (student_id is not null or invite_email is not null or invite_token is not null)
);
create index teacher_student_teacher_idx on teacher_student_relationships (teacher_id, status);
create index teacher_student_student_idx on teacher_student_relationships (student_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- Assignments (the template, owned by the teacher)
-- ────────────────────────────────────────────────────────────────────────────
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid references auth.users(id) on delete set null,   -- nullable for orphan after teacher deletion
  title        text not null,
  description  text,
  instructions text,
  items        jsonb not null default '[]'::jsonb,                  -- array of { content_type, snapshot, order, notes }
  orphaned     boolean default false,                                -- true if teacher deleted
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index assignments_teacher_idx on assignments (teacher_id, updated_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- Assignment recipients (per-student state and schedule)
-- ────────────────────────────────────────────────────────────────────────────
create table assignment_recipients (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references assignments(id) on delete cascade,
  student_id     uuid references auth.users(id) on delete cascade,
  assigned_at    timestamptz not null default now(),
  due_at         timestamptz,                                       -- per-student due date
  status         text not null default 'not_started',               -- 'not_started' | 'in_progress' | 'complete'
  started_at     timestamptz,
  completed_at   timestamptz,
  unique (assignment_id, student_id)
);
create index assignment_recipients_student_idx on assignment_recipients (student_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- Assignment notes (scoped communication between teacher and student)
-- ────────────────────────────────────────────────────────────────────────────
create table assignment_notes (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references assignment_recipients(id) on delete cascade,
  author_id     uuid references auth.users(id) on delete set null,  -- null = "[Deleted User]"
  body          text not null,
  created_at    timestamptz not null default now(),
  reported      boolean default false,
  report_count  int default 0
);
create index assignment_notes_recipient_idx on assignment_notes (recipient_id, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- Subscriptions (monetization tier per user)
-- ────────────────────────────────────────────────────────────────────────────
create table subscriptions (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  tier           text not null default 'free',                       -- 'free' | 'pro' | 'teacher'
  active         boolean default true,
  expires_at     timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at     timestamptz not null default now()
);
```

### RLS policies (concrete)

```sql
alter table profiles enable row level security;
create policy "anyone signed-in reads public profiles" on profiles for select
  using (auth.role() = 'authenticated' and (profile_public = true or user_id = auth.uid()));
create policy "users update own profile" on profiles for update using (auth.uid() = user_id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = user_id);
-- delete is handled by auth.users cascade

alter table patterns enable row level security;
create policy "users read own patterns" on patterns for select using (auth.uid() = user_id);
create policy "anyone reads non-private patterns" on patterns for select using (visibility != 'private');
create policy "users write own patterns" on patterns for all using (auth.uid() = user_id);

-- Repeat similar for compositions, voice_presets

alter table teacher_student_relationships enable row level security;
create policy "both sides see their relationships" on teacher_student_relationships for select
  using (auth.uid() = teacher_id or auth.uid() = student_id);
create policy "teacher creates relationship" on teacher_student_relationships for insert
  with check (auth.uid() = teacher_id);
create policy "either side updates" on teacher_student_relationships for update
  using (auth.uid() = teacher_id or auth.uid() = student_id);

alter table assignments enable row level security;
create policy "teacher sees own assignments" on assignments for all using (auth.uid() = teacher_id);
create policy "student sees assignments via recipient" on assignments for select using (
  exists (select 1 from assignment_recipients ar where ar.assignment_id = id and ar.student_id = auth.uid())
);

alter table assignment_recipients enable row level security;
create policy "teacher manages recipients" on assignment_recipients for all using (
  exists (select 1 from assignments a where a.id = assignment_id and a.teacher_id = auth.uid())
);
create policy "student reads own recipient row" on assignment_recipients for select using (auth.uid() = student_id);
create policy "student updates own status" on assignment_recipients for update using (auth.uid() = student_id);

alter table assignment_notes enable row level security;
create policy "participants read notes" on assignment_notes for select using (
  exists (
    select 1 from assignment_recipients ar
    join assignments a on a.id = ar.assignment_id
    where ar.id = recipient_id
      and (a.teacher_id = auth.uid() or ar.student_id = auth.uid())
  )
);
create policy "participants insert notes" on assignment_notes for insert with check (
  author_id = auth.uid() and exists (
    select 1 from assignment_recipients ar
    join assignments a on a.id = ar.assignment_id
    where ar.id = recipient_id
      and (a.teacher_id = auth.uid() or ar.student_id = auth.uid())
  )
);

alter table user_settings enable row level security;
create policy "users own settings" on user_settings for all using (auth.uid() = user_id);

alter table subscriptions enable row level security;
create policy "users read own subscription" on subscriptions for select using (auth.uid() = user_id);
-- updates only by service role (Stripe webhook)
```

---

## Auth & sign-up flow

### Provider configuration

- **Google OAuth** is the v1 provider. Configure in Supabase dashboard. Redirect URLs registered for `localhost:5173`, all Vercel preview URLs, and production domain.
- All client code uses Supabase's generic `User`/`Session` types. **No provider-specific data is ever read.** Avatars, names — all entered by the user.

### First sign-in flow

1. User clicks "Continue with Google" in the signup modal.
2. OAuth round-trip lands them back at `/?auth-callback=...` (or wherever Supabase configures).
3. AuthCallbackHandler component detects "first sign-in" (no `profiles` row exists for this user).
4. Routes to a sign-up form page:
   - Display name (required, unique check on submit, permanent)
   - User type (required multi-select)
   - All optional fields (avatar, bio, pronouns, external link, socials, instruments, years, skill, genres, lessons flags)
5. On submit: insert `profiles` row + `user_settings` singleton + `subscriptions` row (tier='free') in a single transaction.
6. If session storage has anon content → migration prompt modal:
   - "You created N patterns, M compositions, K voice variants during this session. Add them to your account?"
   - Add → bulk-insert into respective tables.
   - Discard → clear sessionStorage.
7. Drop user into the app.

### Returning sign-in

1. Click "Continue with Google".
2. OAuth round-trip.
3. AuthCallbackHandler sees an existing `profiles` row. No setup form.
4. Cloud content loads. Migration prompt only fires if session has un-merged content (rare for returning users; not impossible).
5. User lands in the app.

### Sign-out

- Supabase clears auth tokens.
- App clears: in-memory user state, in-memory cached content, sessionStorage.
- Transport (metronome) stops if running.
- Redirect to the public landing / anon view.

### Session lifecycle (Supabase defaults)

- Access JWT: 1h
- Refresh token: 30d sliding window
- Silent refresh: automatic
- Inactive 30d → re-auth required

---

## Persistence model

| State | Anon | Signed-in |
|---|---|---|
| Patterns | `sessionStorage` (preview only; dies on tab close) | Supabase `patterns` |
| Compositions | `sessionStorage` | Supabase `compositions` |
| Voice presets | `sessionStorage` | Supabase `voice_presets` |
| User settings (active presets, reverb, walkthrough flags) | not applicable | Supabase `user_settings` |
| Auth tokens | n/a | Supabase library (its own localStorage; the auth token is per-user, not personal content) |

Anon users get the full demo experience. Any account-gated action (share, fork-permanently, comment, follow, be-a-teacher, etc.) opens the **signup CTA modal**:

```
To use this feature, sign up or sign in.
[ Continue with Google ]
```

On signup, the **migration prompt** captures any session content the anon user created. All-or-nothing. Blocking. No partial selection.

---

## Sharing, forking, attribution

### Visibility levels (on patterns, compositions, voice presets)

- **private** (default) — only the owner sees it.
- **unlisted** — accessible by direct link; not in browse/discovery.
- **public** — accessible everywhere (discovery, search).

### Sharing UX

- "Share" button on each pattern/composition/voice preset opens a control:
  - Visibility toggle (private / unlisted / public).
  - Copy-link button (generates `/?pattern=<uuid>` or similar).
- Anyone signed-in can view unlisted/public content via the link.
- Anon viewers hit the signup CTA modal (per the "account-required for everything" stance — anon only sees the practice page and the demo editor).

### Forking

- "Fork to my library" button on shared content (signed-in only).
- Creates an independent copy in the forker's library with `forked_from_id` set.
- Forks are fully editable — owner has all rights to their copy.
- Source can change or delete freely; fork is unaffected (the snapshot is copied).
- Forked rows show "Forked from [Original Creator]" attribution (or "[Deleted User]" if source creator's account is gone).

### Attribution display

- On shared content, "Created by [DisplayName]" is shown.
- If the creator's profile is public, the name is a clickable link to their profile page.
- If the creator's profile is private, the name is a non-clickable plain label.
- If the creator's account has been deleted, the label is "[Deleted User]" (non-clickable).

---

## Catalog-forward metadata

Shared content (patterns, compositions, voice presets) will eventually live in a browseable catalog. The browse page itself is deferred (see "Explicit deferrals"), but the metadata the catalog needs to filter on has to exist on every shared row from day one — backfilling user-typed fields after the fact is impossible.

### Schema additions

```sql
alter table patterns
  add column description    text,
  add column difficulty     text,                 -- 'beginner' | 'intermediate' | 'advanced'
  add column genres         text[] default '{}',  -- curated list
  add column tags           text[] default '{}',  -- curated list
  add column instrument_id  text,                 -- denormalized from data jsonb for filter perf
  add column published_at   timestamptz;          -- set when visibility first leaves 'private'

create index patterns_catalog_idx on patterns
  (visibility, instrument_id, difficulty, published_at desc)
  where visibility != 'private';
create index patterns_tags_gin   on patterns using gin (tags)   where visibility != 'private';
create index patterns_genres_gin on patterns using gin (genres) where visibility != 'private';
```

Same migration applies to `compositions` and (minus `instrument_id`, which already exists) to `voice_presets`.

### Field semantics

| Field | Source | Notes |
|---|---|---|
| `description` | User-typed | Free-form text. |
| `difficulty` | User-typed | App-level enum: `beginner` / `intermediate` / `advanced`. Plain `text`. |
| `genres` | User-typed | Curated list (musical styles: blues, jazz, rock, classical, …). `text[]`. |
| `tags` | User-typed | Curated list (pattern role/context: solo, backing-track, intro, practice, warm-up, …). `text[]`. |
| `instrument_id` | Derived from `data` jsonb at write time | Denormalized for filter queries. |
| `published_at` | App-set when visibility transitions out of `private`. Cleared if it returns to `private`. | Used for "recently published" sorting. |

### Convention notes

- **No Postgres ENUMs.** Every existing categorical column in the schema (`visibility`, `status`, `tier`, `skill_level`) is plain `text` validated at the app layer; new fields follow that pattern. ENUMs are sticky (`ALTER TYPE ADD VALUE` is irreversible, can't be reordered) and these lists will evolve.
- **Curated lists live in lib code** (e.g. `lib/src/catalog/genres.ts`, `lib/src/catalog/tags.ts`) — exported constants used for both UI rendering and write-time validation. Adding a value is a code change, not a migration.
- **Pattern attributes already in the `data` jsonb** (key, scale, tuning, CAGED shape) are *not* duplicated as columns yet. When the catalog browse page lands, those can be extracted via a one-time backfill — they're deterministically derivable from each row's `data`. Only user-typed fields need columns now.

---

## Patterns page — top controls bar

The patterns page (`?page=patterns`) gets a new full-width top controls bar that replaces the old `LibrarySidebar` and houses all per-item metadata and visibility editing. Sidebars are removed from any view that has a fretboard, to give the fretboard the horizontal room it needs.

### Layout

```
┌── PatternsTopBar (page-level global nav) ───────────────────────────────┐
├── Top Controls Bar (new) ───────────────────────────────────────────────┤
│  Name   Difficulty   Genres   Tags   Visibility   (all read-only here) │
├── WorkspaceTabs  [Edit | Arrange] ──────────────────────────────────────┤
├── EditorToolbar ────────────────────────────────────────────────────────┤
│                                                                         │
│            [ FretboardInput — full page width ]                         │
│                                                                         │
│            [ PatternTimeline — full page width ]                        │
└─────────────────────────────────────────────────────────────────────────┘
```

The bar always reflects the currently-active item: a pattern on the Edit tab, a composition on the Arrange tab. Same UI, same fields, polymorphic source.

### Interaction model

Parity with the practice page's `HeadstockMenu`:

- **Closed bar** = a single giant button with read-only summary text. No clickable sub-regions.
- **Click anywhere on the bar** → opens *one* popover containing all editable fields (name, description, difficulty, genres, tags, visibility + share link).
- **Inside the popover**, the name field doubles as the pattern picker — click it to switch to a different pattern.

### Components

```
SimplePopover (lib — exists)
  ├─ HeadstockMenu content   (practice page — tuning + labels)             ← exists
  ├─ ItemMetadataPanel       (patterns + compositions — name/desc/         ← new
  │                            difficulty/genres/tags/visibility/link)
  └─ PatternPickerPanel      (patterns library — search + select)          ← new
```

`ItemMetadataPanel` takes the active item (`Pattern | Composition`) and reads/writes the corresponding store and DB table. One component, both tabs.

### Empty state

On page load with no pattern open, an in-memory "Untitled" draft is auto-seeded with default values. The metadata bar shows it immediately. Nothing persists until the first real change — first note added, first field edited. If the user navigates away without editing, no DB row is created and the library stays uncluttered.

(Future polish recorded in "Design follow-ups": per-chip popovers as an alternative to the single-popover model, applied consistently across the practice and patterns pages.)

---

## Teacher / student workflows

### Establishing the relationship

- Teacher initiates via one of:
  - **Invite by email** — types student's email; row inserted in `teacher_student_relationships` with `invite_email` set + status='pending'. If recipient eventually signs up, the relationship is auto-claimed at signup. If never claimed, stays pending forever (or until teacher revokes).
  - **Invite link** — generates a one-time-ish token. Recipient opens `/invite/<token>`; if signed in, accepts; if not, signs up first then auto-accepts.
- Mutual opt-in. Status moves `pending → active` on recipient acceptance.
- Either side can end (`ended`). Future assignments blocked.

### Creating an assignment

- Teacher creates an Assignment in their UI: title, description, instructions, items (pattern/composition snapshots picked from their library), no due date at this level.
- Selects one or more students from their active relationships → inserts `assignment_recipients` rows, with **per-student** `due_at` set.

### Receiving an assignment (student view)

- Student sees an "Assignments" inbox listing every `assignment_recipients` row for them.
- Each row links to the assignment, where they can view items (read-only — the items are snapshots).
- Student can mark progress: not_started → in_progress → complete.
- Student can fork any item into their own library (creates a regular `patterns`/`compositions` row, fully editable, separate from the assignment).

### Communication (notes)

- Notes attached to a specific `assignment_recipients` row (i.e., to *this* assignment for *this* student).
- Either side (teacher, student) can leave notes; both see them.
- Async — no real-time chat, no general DMs.
- Length limit: 1000 chars.
- Per-note: report button + soft moderation flags.
- Block/end-relationship action on either side severs the relationship and stops future notes.

### No public teacher directory

Discovery of new teachers / students is **out-of-band** (word of mouth, websites, music schools). The app facilitates the formalized relationship; it doesn't help strangers find each other. Teacher and student profiles ARE viewable (signed-in only) for users who already know each other's display names or follow attribution links — but there's no browse/search/match surface.

---

## Account deletion

### Mechanic

- "Delete account" button in profile settings.
- Confirmation step: type your display name to confirm.
- **Immediate**, no grace period.

### What happens to data

| Category | Fate |
|---|---|
| Profile row | Hard deleted (PII gone) |
| `auth.users` row | Hard deleted (Supabase admin API) |
| Private patterns/compositions/voice presets | Hard deleted |
| **Shared** (unlisted/public) patterns/compositions/voice presets | **Orphan** — content rows stay, `user_id` set to null or sentinel, displayed as "Created by [Deleted User]" |
| Forks the user made of others' content | Hard deleted (they were the user's copies) |
| Forks of the user's content by others | Survive (independent copies); `forked_from_id` becomes dangling pointer → displayed as "Forked from [Deleted User]" |
| Assignments the user sent (as teacher) | **Orphan** — `assignments` rows stay with `orphaned=true`, students keep access to learning material; no new updates possible |
| Assignments the user received (as student) | Hard deleted; teacher's roster preserves an anonymized ghost entry |
| Notes the user authored | Body preserved, author_id set to null → displayed as "[Deleted User]" |
| Teacher's roster after a student deletes | Relationship row preserved with `student_deleted=true`, student_id set to sentinel; aggregate stats preserved (assignment count, completion count, activity date range); display as "[Deleted User #abcd]" with unique suffix to distinguish multiple past students |

If a user wants *everything* gone (including their shared content), they manually delete their shared content *before* deleting the account.

---

## Sound Lab expansion

### Current state

`fretwork:lab-presets:v1` in localStorage stores one override per shipped preset id (5 presets: acoustic-guitar, electric-guitar, acoustic-bass, electric-bass, acoustic-ukulele). User tweaks parameters via sliders; only the most recent tweak per shipped preset survives.

### New model

- A user can save any number of named voice preset **variants** per `(instrumentId, family)` pair.
- For each `(instrumentId, family)`, the user picks an **active variant** (stored in `user_settings.active_presets` as a map of `'guitar-acoustic' → <preset uuid>`).
- If no active variant: fall back to committed `/public/presets/<id>.json` → shipped default.
- Variants can be shared (forked, public/private) like patterns. They're shareable across the same `(instrumentId, family)`.

### Sound Lab UI changes

- New **Variants** picker per `(instrumentId, family)`: dropdown listing the user's saved variants for this pair + "Default (shipped)".
- "Save as…" button → text-input modal → creates a new `voice_presets` row.
- Rename / delete on the active variant.
- Auto-save on parameter change writes to the active variant.

### Anon Lab

- Anon users get the same UI but storage is sessionStorage.
- Variants count toward the migration prompt at signup.

### `buildEffectiveVoice` (existing helper)

Updates to read from `user_settings.active_presets` first (when signed in) → committed file → shipped default. Signature unchanged.

---

## Monetization tiers

### Three tiers, linear additive

| Tier | Price (illustrative) | Caps / features |
|---|---|---|
| **Free** | $0 | 200 patterns / 100 compositions / 20 voice variants in own library. Full catalog/community browsing. Sharing + forking work (forks count toward caps). Basic Sound Lab. No exports / recording / analytics. |
| **Pro** | $5–10/mo | Free + unlimited patterns/compositions/voice variants. Exports (MIDI/MusicXML/audio). Audio recording. Practice analytics. Multi-variant Sound Lab fully unlocked. |
| **Teacher** | $15–25/mo | Pro + teaching workflows: student management, assignments, notes, per-student tracking. Some student-count cap (e.g., 30). |

### What's NOT gated

- Sharing and forking are free for everyone — gating those breaks the network-effect engine.
- Browsing public content (catalog, community) is fully open at all tiers.
- The Sound Lab tool itself works for free; only the saved-variant count is capped.

### Free-tier limit messaging

When a free user hits a cap:

> Your library is full. Delete something to make room, or upgrade to Pro for unlimited storage. [Upgrade]

This is where most upgrade conversions happen.

### Stripe / billing (deferred to later milestone)

The `subscriptions` table holds tier + Stripe IDs. Actual Stripe integration is a later milestone; v1 of the schema just has tier='free' for everyone.

---

## Help / onboarding

- **No forced onboarding flows.** New users land directly in the app after the signup form.
- **Per-page help button** (small `?` icon) on each major page (Practice, Patterns, Sound Lab, Assignments-as-teacher, Assignments-as-student). Opens a panel with:
  - "Start walkthrough" — contextual guided tour of this page.
  - Page-specific documentation and tips.
- **Settings → Walkthroughs** — global preference (auto-show-once vs never-show).
- Walkthrough state is per-user (stored in `user_settings.walkthrough_seen`) so a user signing in on a new device doesn't get re-prompted.

---

## Signup CTA modal

A single, reusable modal triggered by any account-gated action. Functionally minimal:

```
[Modal]
To use this feature, sign up or sign in.
[ Continue with Google ]
```

Wording polished later. The trigger action is preserved so we can return the user to their intent after auth completes (e.g., they clicked "Fork" → after auth, the fork action runs).

---

## File layout

### New in `lib/src/`

```
lib/src/auth/
├── index.ts
├── supabaseClient.ts              # createClient() singleton; reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
├── useAuthStore.ts                # Zustand store: user, profile, session, status
├── useAuth.ts                     # React hook with signIn/signOut + onAuthStateChange wiring
├── migration.ts                   # Pure logic for the anon→signed-in migration payload builder
└── types.ts

lib/src/cloud/
├── patternsSync.ts                # Replaces localStorage persist with Supabase sync for signed-in users
├── compositionsSync.ts            # Same
├── voicePresetsSync.ts            # Same
└── userSettingsSync.ts            # Singleton settings sync

lib/src/teaching/
├── relationships.ts               # Teacher-student relationship operations
├── assignments.ts                 # Assignment CRUD
├── notes.ts                       # Assignment-scoped notes
└── types.ts

lib/src/subscription/
├── tierLimits.ts                  # Tier → cap mapping
├── useSubscription.ts             # Reads subscription tier from store
└── types.ts
```

### New in `example/src/`

```
example/src/auth/
├── SignInButton.tsx               # Replaces the disabled TopBar placeholder
├── UserMenu.tsx                   # Dropdown shown when signed in
├── SignupModal.tsx                # The CTA-driven modal
├── AuthCallbackHandler.tsx        # Processes OAuth redirect; routes to setup or migration
├── SignupForm.tsx                 # First-time profile creation form
└── MigrationPromptDialog.tsx      # Session-content migration modal

example/src/profile/
├── ProfilePage.tsx                # /?profile=<display-name> or /u/<name>
├── ProfileSettings.tsx            # Edit own profile (at ?settings=1)
└── DeleteAccountFlow.tsx          # Account deletion confirmation + execution

example/src/patterns/layout/
├── PatternControlsBar.tsx         # Full-width top controls bar (replaces LibrarySidebar)
├── ItemMetadataPanel.tsx          # Popover content: name/desc/difficulty/genres/tags/visibility
└── PatternPickerPanel.tsx         # Popover content: switch active pattern

lib/src/catalog/
├── genres.ts                      # Curated genre list
├── tags.ts                        # Curated tag list
└── difficulty.ts                  # Difficulty enum + helpers

example/src/teaching/
├── StudentRoster.tsx              # Teacher's view of all their students
├── AssignmentBuilder.tsx          # Create/edit an assignment
├── AssignmentRecipientsManager.tsx # Per-student due dates + status
├── AssignmentInbox.tsx            # Student's view of received assignments
├── AssignmentDetailView.tsx       # Read-only view for students
├── NotesThread.tsx                # Scoped notes UI
└── InviteFlow.tsx                 # Invite by email or link

example/src/subscription/
├── TierBadge.tsx                  # Visual indicator of current tier
├── UpgradePrompt.tsx              # "Library full" message + upgrade CTA
└── BillingPage.tsx                # Placeholder; real Stripe wiring deferred

example/src/help/
├── HelpButton.tsx                 # Per-page `?` icon
├── HelpPanel.tsx                  # Panel with walkthrough launcher + docs
└── Walkthroughs/                  # Per-page walkthrough scripts
```

### Touched (small surgery)

- `lib/src/patterns/store/usePatternsStore.ts` — swap `localStorage` for `sessionStorage` (anon); add cloud-sync adapter wired by auth state.
- `lib/src/playback/voices/preset-overrides.ts` — refactor resolution chain to consult `user_settings.active_presets` first for signed-in users.
- `lib/src/components/TopBar.tsx` + `example/src/components/TopBar.tsx` — replace disabled Sign-In button with `<SignInButton/>`.
- `example/src/main.tsx` — mount `<AuthCallbackHandler/>` at root.
- `example/src/sound-lab/SoundLab.tsx` — add Variants picker, Save-as / Rename / Delete affordances.
- `example/.env.example` (new) + `.gitignore` — env var template; ignore `.env.local`.
- `lib/package.json` — add `@supabase/supabase-js`.

### Untouched (zero regression target)

- `useFretworkStore` (URL-state only).
- `useMetronomeStore`, `usePlaybackStore` (ephemeral; no migration needed).
- Pattern data shape (already JSON-safe).
- Practice page internals.

---

## Implementation checklist

Group A through G are roughly sequential — each unlocks the next. Within a group, items can usually be done in any order.

### Group A — Supabase foundation

- [x] Install `@supabase/supabase-js` in `lib/package.json` (v2.105.4)
- [x] Create `lib/src/auth/supabaseClient.ts` with the singleton `createClient(URL, ANON_KEY)` reading from `import.meta.env`. Exports `getSupabaseClient()`, `isSupabaseConfigured()`, `_resetSupabaseClientForTests()`.
- [x] Add `example/.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders
- [x] Update `.gitignore` to ignore `.env.local`, `.env.*.local` *(already covered by existing root `.gitignore`'s `.env*` + `!.env.example` rules)*
- [x] Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to local `.env.local`
- [x] Register the same env vars in Vercel (preview + production environments)
- [x] In Supabase dashboard: enable Google OAuth provider. Configure OAuth credentials from Google Cloud Console. Register redirect URLs (`localhost:5173`, Vercel preview pattern, production domain).

### Group B — Database schema

The 10 originally-planned migration files were consolidated into 4 logical groups for easier review and atomic application. Each file contains multiple related tables + their RLS policies.

- [x] Create `supabase/migrations/0001_profiles_and_settings.sql` — `profiles` + `user_settings` tables, indexes, RLS
- [x] Create `supabase/migrations/0002_user_content.sql` — `patterns` + `compositions` + `voice_presets` tables, indexes, RLS
- [x] Create `supabase/migrations/0003_teaching.sql` — `teacher_student_relationships` + `assignments` + `assignment_recipients` + `assignment_notes`, indexes, RLS
- [x] Create `supabase/migrations/0004_subscriptions.sql` — `subscriptions` table, RLS (service_role required for upgrades)
- [x] Run the migrations against the Supabase project (`supabase db push`)
- [ ] Manually verify RLS: as `anon`, attempt selects on each table — should return 0 rows. Sign in as test user; verify isolation between two test users.

### Group C — Auth state + sign-in UX

**Foundation pieces (lib-side) — done:**

- [x] Build `lib/src/auth/types.ts` — `Profile`, `AuthStatus` (`idle`/`loading`/`signed-out`/`needs-profile`/`signed-in`), `CreateProfileInput`, `rowToProfile()` snake→camel helper
- [x] Build `lib/src/auth/useAuthStore.ts` — Zustand store with `user`, `profile`, `session`, `status`, `error`, plus selectors (`selectIsSignedIn`, `selectNeedsProfile`, `selectIsAuthLoading`)
- [x] Build `lib/src/auth/useAuth.ts` — hook wiring `getSession()` + `onAuthStateChange` to the store; exposes `signInWithGoogle`, `signOut`, `refreshProfile`; auto-fetches profile row and sets `needs-profile` status when authenticated but no profile row exists
- [x] Export auth surface from `lib/src/index.ts`

**UI pieces (example-side):**

- [x] Build `example/src/auth/SignupModal.tsx` — universal CTA modal with the "Continue with Google" button + Google brand SVG. Reads `signupModalOpen` state from useAuthStore; dismissible via X / Escape / click-outside.
- [x] Build `example/src/auth/SignInButton.tsx` — TopBar slot: renders Sign In CTA when signed-out (opens SignupModal); renders UserMenu when signed-in; loading skeleton while auth is resolving.
- [x] Build `example/src/auth/UserMenu.tsx` — dropdown with avatar/initials + display name; menu items: Profile (links to `?profile=<name>`), Settings (links to `?settings=1`), Sign out.
- [x] Build `example/src/auth/AuthCallbackHandler.tsx` — root-mounted component: calls `useAuth()` to start the singleton subscription, renders SignupModal always, overlays SignupForm when status = `needs-profile`.
- [x] Mount `<AuthCallbackHandler/>` in `example/src/main.tsx` (rendered alongside every route).
- [x] Replace disabled Sign In button in `example/src/components/TopBar.tsx` with `<SignInButton/>`. *(lib's `TopBar.tsx` left alone — it's a generic component for hypothetical other consumers; updating it would require a slot-injection refactor that's out of scope for this work.)*
- [x] Build `example/src/auth/SignupForm.tsx` — first-time profile creation form: required display name (with unique check via RPC error code 23505) + user_types multi-select; optional bio, pronouns, external link, Instagram/YouTube/SoundCloud handles, instruments, years playing, skill level, genres, lessons flags.
- [x] On submit, insert `profiles`, `user_settings`, `subscriptions(tier='free')` rows in one transaction via RPC.
- [x] Build Supabase RPC `create_profile_with_settings` to do this atomically (`supabase/migrations/0005_create_profile_rpc.sql`). Apply with `supabase db push`.

### Group D — Anon → signed-in migration

- [x] Build `lib/src/auth/migration.ts` — `readSessionContent()`, `countSessionContent()`, `uploadSessionContent()`, `clearSessionContent()`. Pure read + bulk insert into `patterns`/`compositions` for current user. (Voice presets handled in Group F when Sound Lab cloud-syncs.)
- [x] Build `example/src/auth/MigrationPromptDialog.tsx` — blocking modal with Add / Discard, item counts, error display. Not dismissible without choosing. Sets `sessionStorage['fretwork:migration-done']` after resolution so cloud-sync-repopulated session storage doesn't re-trigger on subsequent renders.
- [x] Wire migration into `AuthCallbackHandler`: on the first signed-in transition with non-empty session content AND no migration-done flag, prompt opens. Add uploads + clears + flags + resets store. Discard clears + flags + resets. Either path closes the modal and won't re-prompt this tab session.
- [x] Migration-done flag cleared by cloud-sync teardown on sign-out so a subsequent anon → signup flow in the same tab can re-trigger the prompt.
- [x] Switch `lib/src/patterns/store/usePatternsStore.ts` `persist`'s storage from `localStorage` to `sessionStorage`.
- [x] One-time-migration shim `migrateLegacyLocalStorage()`: on module import, if `localStorage['fretwork:patterns:v1']` exists AND sessionStorage doesn't, copy to sessionStorage then delete the localStorage key. Idempotent.

### Group E — Patterns/Compositions cloud sync

- [x] Build `lib/src/cloud/sync.ts` — generic diff-and-sync for both patterns + compositions in a single module. On sign-in, fetches all rows and hydrates the store. On every store mutation, debounces 500ms then INSERTs new rows / UPDATEs changed rows / DELETEs removed rows. Hydration uses an `isHydrating` flag so cloud-load doesn't loop back as outgoing sync.
- [x] Switched `Pattern.id` and `Composition.id` to UUIDs (new `generateUuid()` helper in `lib/src/patterns/ids.ts`); event/lane ids in jsonb keep the short-prefix format. UUIDs match the Supabase row id type so the same id works in-memory and on disk.
- [x] On hydration, overwrite `Pattern.id` with the DB row id (handles migrated anon content where data.id was the legacy `pat_xxx` format).
- [x] `useCloudSync()` hook in `lib/src/cloud/index.ts`. Watches `useAuthStore.status === 'signed-in'`; activates on sign-in, tears down on sign-out / user change.
- [x] Sign-out cleanup integrated into teardown: clears in-memory store via `usePatternsStore.setState(DEFAULT_PATTERNS_STATE)`, clears `sessionStorage['fretwork:patterns:v1']`, cancels pending debounce.
- [x] Wired into `AuthCallbackHandler` (one call alongside `useAuth()`).
- [ ] Cross-device manual verification (sign in on Chrome, create pattern; sign in on Firefox; see it).

### Group F — Sound Lab expansion + cloud sync

Split into two sub-groups for shipping clarity.

**F.1 — Storage migration & cloud sync (Lab UI unchanged):**

- [x] Switch `preset-overrides.ts` from `localStorage` to `sessionStorage`. Added one-time-migration shim `migrateLegacyLabStorage()` that copies existing `localStorage['fretwork:lab-presets:v1']` to sessionStorage on module import. Idempotent.
- [x] Extended `cloud/sync.ts` with `hydrateLabFromCloud()` + `performLabSync()`: pulls `voice_presets` rows + `user_settings.reverb` on sign-in into the existing `PresetOverridesData` shape; subscribes to override changes via `subscribeToOverrides`; debounced 500ms diff-sync (INSERT/UPDATE/DELETE for voice_presets; upsert for user_settings.reverb). Row-id map (`labRowIdByPresetId`) makes UPDATEs O(1) without round-trip selects.
- [x] Migration prompt extended: `MigrationCounts` gains `voiceVariants` + `reverbCustomized`; `uploadSessionContent()` uploads voice variants + active-variant refs + reverb in addition to patterns/compositions. MigrationPromptDialog UI shows additional rows.
- [x] Teardown on sign-out clears `LAB_STORAGE_KEY` from sessionStorage and resets in-memory caches via `saveOverrides({...empty})`.

**F.2 — Multi-variant UI ✅ Done:**

Core data model + sync:
- [x] Per-instrument variants store (`useVoiceStore`) with sessionStorage v2 + cloud round-trip via `voice_presets` + `user_settings.active_presets` (jsonb map keyed by instrumentId). Debounced auto-save is gone — sync fires on every committed store change (Save / Save-as / Rename / Move / Delete / variant-switch).
- [x] New resolver `resolveActiveVoice(instrumentId)` replaces `findEffectivePreset`; falls back to the instrument's first default on any miss. Old override APIs (`findEffectivePreset`, `getEffectivePreset`, `setPresetOverride`, `clearPresetOverride`, `clearAllOverrides`, `getPresetSource`, `subscribeToOverrides`) removed.
- [x] `sanitizeActiveVariants` on hydrate: stale user-variant refs fall back to defaults instead of resolving to nothing.

Picker infrastructure:
- [x] Shared `<LibraryPickerPanel>` extracted from `PatternPickerPanel` (in `example/src/library/`). Folder helpers (`buildBreadcrumb`, `subfoldersOf`, `itemsInFolder`, `buildFolderCounter`, `countItemsInFolderTree`) live in `example/src/library/folder-helpers.ts`. Patterns picker + new `CompositionPickerPanel` + voices picker all wrap it.
- [x] `<VoicePickerChip>` mounted in three places: Sound Lab header (`allowMutations`), Practice page strip (replaces acoustic/electric segmented toggle and radio group), Patterns page controls bar. Per spec, create/rename/move/delete only exposed in the Sound Lab.
- [x] SaveAs / Rename / Delete / Move dialogs. SaveAs + Move support inline "+ New folder" creation that nests under the currently-selected folder.

Sound Lab rewrite:
- [x] Instrument tab strip (guitar / bass / ukulele).
- [x] Ephemeral `pendingPreset` state — slider edits never persist until the user commits.
- [x] Two save buttons: Save (disabled when active = default) and "Save as new variant…".
- [x] Defaults read-only banner + dirty-state confirm on instrument/variant switch + `beforeunload` guard for full-page nav.
- [x] Removed: auto-save / debounced sync / `Reset preset` / `Reset all` / `SourceIndicator` / Export-Import (slot-keyed) / dev POST plugin.

Mounts on Practice + Patterns:
- [x] `VoicePickerChip` (read-only) replaces the acoustic/electric toggle in the metronome strip's `SoundControls` / `SoundInlineToggle` (Practice page).
- [x] `VoicePickerChip` in `PatternControlsBar` (Patterns page), scoped to the active item's instrument.

Catalog page:
- [x] `?page=catalog` mounted in `main.tsx` + `Catalog` link in TopBar nav. Heterogeneous library browser (`example/src/catalog/CatalogPage.tsx` + `CatalogRow.tsx`) with kind / instrument / search filters and kind-aware folder counts. Opens each kind in the appropriate editor on click.
- [x] TopBar nav now reflects active route across Practice / Patterns / Catalog (shared `navLinkClass(active)` helper).

Tier cap enforcement:
- [x] `gateCreate` extracted to `lib/src/subscription/gate.ts`; both `usePatternsStore` and `useVoiceStore` import from it.
- [x] `useVoiceStore.addVariant` enforces `voiceVariants` cap (20 on Free). Anon → SignupModal; signed-in → UpgradePrompt. `SaveAsVariantDialog` closes on refusal so the prompt is the sole modal.
- [x] Cap key renamed `voicePresets` → `voiceVariants` throughout `CappedKind` / `TIER_LIMITS` / `KIND_LABELS` / `UpgradePromptContext.kind` + user-facing copy.

Default-preset workflow:
- [x] Single source of truth for shipped baselines is `lib/src/playback/voices/presets.ts`. Acoustic-guitar tuning previously living in `example/public/presets/acoustic-guitar.json` was baked into `presets.ts` (`harmonicity: 1` → `1.95`). The committed-file loader (`seedCommittedPresets`, `getCommittedPreset`, `committedPresetsLoaded`) and the `public/presets/` directory were deleted.

Dead-code sweep:
- [x] `voiceFamily` / `setVoiceFamily` removed from `UsePlaybackReturn` and `usePlaybackStore` (no consumers after the toggle was replaced).
- [x] `sidebarCollapsed` field + `setSidebarCollapsed` setter removed from `usePatternsStore` (LibrarySidebar was deleted during Group H).
- [x] `migrateLegacyLocalStorage` shim removed from `usePatternsStore.ts` (pre-launch, no real users to migrate).
- [x] `DEFAULT_PRESET_BY_INSTRUMENT`, `getVoicePreset`, `getVoicePresetsFor`, `PRESETS_BY_ID` deleted from `presets.ts` and from every barrel.
- [x] `example/vite-lab-save-plugin.ts` + its registration in `vite.config.ts` deleted.

**Deferred to a follow-up (tracked here so nothing gets lost):**

- [ ] **Admin-gated default-preset publishing.** No way today for the project owner to ship a tuned voice as the new shipped baseline without editing `presets.ts` by hand. Proper path: admin user_id list + Supabase `committed_presets` table (admin-only RLS) + "Publish as default" button in the lab + resolver consults committed layer between user variants and shipped defaults. Memory captured at `~/.claude/projects/.../memory/project_admin_portal_for_default_presets.md`. Until then, `presets.ts` is the only path.
- [ ] **Defaults for the 4 non-acoustic-guitar slots remain at the source-code baseline.** Electric guitar, acoustic bass, electric bass, and acoustic ukulele have not been tuned via the lab. When the admin portal lands (or via manual `presets.ts` edits) these should be revisited.
- [ ] **Variant Export / Import.** The old slot-keyed JSON blob Export/Import was removed in Chunk 4. A single-variant equivalent (clipboard-copy of the active variant's preset blob) would let users back up / share individual variants outside the cloud-sync layer. Build when there's a real workflow that needs it.
- [ ] **Composition / voice-preset share-route viewers.** `?composition=<uuid>` and `?voice-preset=<uuid>` parallel to `?pattern=<uuid>` are still unbuilt (also listed under Group G).
- [ ] **"Forked from [Original Creator]" attribution surface.** `forkedFromId` is captured at fork time but no UI surfaces it yet (also listed under Group G).
- [ ] **Folder picker row-actions polish.** Rename folder, delete folder ("contains N items" confirm), Move-to submenu for items and folders. Today these only work for variants via the dedicated dialogs; folders themselves are still create-and-leave-in-place (also listed under Group H).
- [ ] **Drag-and-drop folder/item reorg** across all pickers + catalog (also listed under Group H).
- [ ] **Cross-device manual verification** — listed in the Group K checklist below; not yet executed for variants specifically.

### Group G — Sharing, forking, profile editor, account deletion ✅ Done

Profile + account deletion:
- [x] Build `example/src/profile/DeleteAccountFlow.tsx` — multi-step UI; triggers `delete_account_cleanup()` RPC + `delete-user` Edge Function; identifies user via JWT.
- [x] Build `example/src/profile/ProfilePage.tsx` — public profile view at `?profile=<displayname>`.
- [x] Build `example/src/profile/ProfileSettings.tsx` — profile editor surface at `?settings=1` (named ProfileSettings instead of the originally-planned ProfileEditor).
- [x] Migration `0007_relationship_aggregate_stats.sql` — adds aggregate-stats columns to teacher-student rows; `delete_account_cleanup()` archives student stats before cascade so deleted-student rosters can render aggregate counts.

Catalog metadata schema + UI:
- [x] Migration `0008_catalog_metadata.sql` — `description` / `difficulty` / `genres` / `tags` / `instrument_id` / `published_at` columns + GIN indexes on `patterns`, `compositions`, `voice_presets`. Pre-launch truncate of patterns/compositions to allow `instrument_id NOT NULL`.
- [x] Curated vocabulary modules: `lib/src/catalog/{description,difficulty,genres,tags,visibility}.ts` — exported constants used for UI + write-time validation; no Postgres enums (per project convention).
- [x] `Pattern` and `Composition` TS types extended with the catalog metadata fields; `createEmpty*` and `clonePattern` default + reset semantics; `applyPatternMetadata` / `applyCompositionMetadata` patch helpers with the visibility → `publishedAt` lifecycle.

Patterns-page UI redesign:
- [x] Removed `LibrarySidebar`, `LibraryItemRow`, `useResponsiveSidebar` — no sidebars in fretboard views.
- [x] `example/src/patterns/layout/PatternControlsBar.tsx` — full-width top controls bar; uses the practice page's `chipButton` style + `SimplePopover`. Extracted `Section` from `TopBar` into a shared primitive (`example/src/components/ui/Section.tsx`) so the two surfaces share one visual language.
- [x] `example/src/patterns/layout/ItemMetadataPanel.tsx` — popover content (Pattern / Catalog / Sharing sections + delete affordance). Polymorphic over `Pattern | Composition`.
- [x] `example/src/patterns/layout/PatternPickerPanel.tsx` — secondary view of the same popover for switching the active pattern.
- [x] `example/src/components/ui/MultiSelectChips.tsx` — reusable multi-select primitive for genres + tags.
- [x] Auto-seed: `usePatternsStore.ensureEditingPattern()` + `discardUnpersistedDraft()`; cloud sync filters out the draft until any mutation promotes it; persisted across refresh-within-tab.
- [x] `published_at` lifecycle wired via `applyPatternMetadata` / `applyCompositionMetadata`.

Sharing, viewer, fork:
- [x] SPA in-app navigation: `example/src/router.tsx` with `Link` / `navigate` / `useLocation`; all `<a href>` inside the example app converted (a memory note records: never use bare `<a href>` for in-app navigation — wipes URL-persisted store state on reload).
- [x] Shared pattern viewer route `?pattern=<uuid>` (`example/src/shared/SharedPatternView.tsx`) — fetch + hydrate + metadata + read-only `MiniPatternSignature` preview + Fork CTA + anon SignupModal gate. RLS-public-row read confirmed.
- [x] Migration `0009_attribution_snapshot.sql` — `created_by_display_name` denormalized onto shareable rows; backfill from current profiles; `delete_account_cleanup()` nulls the snapshot alongside `user_id` on orphaning. Lets anon viewers see attribution without joining the auth-gated profiles table.
- [x] Attribution display: `[Deleted User]` when snapshot is null, otherwise a clickable Link to `?profile=<name>` (profile page handles its own private / not-found states; viewer doesn't double-gate).
- [x] Fork action: `usePatternsStore.forkPattern(source)` deep-clones via `clonePattern` (fresh UUID + event ids; `forkedFromId` set; `visibility` reset to private; `publishedAt` null). Forker's display name snapshotted at next sync INSERT. Anon viewers hit SignupModal.
- [x] Visibility-aware delete confirmation: `example/src/patterns/layout/DeleteItemDialog.tsx`. Adapts copy based on private vs shared. Reuses existing `Dialog` primitive; `forked_from_id ON DELETE SET NULL` handles fork survival.

Deferred (data model ready, UI surface pending):
- [ ] Composition viewer route (`?composition=<uuid>`) — same shape as the pattern viewer.
- [ ] Voice-preset viewer route (`?voice-preset=<uuid>`).
- [ ] "Forked from [Original Creator]" attribution surface — `forkedFromId` data is captured; lands when library cards or catalog listings exist.

### Group H — Library organization (collections / folders) ✅ MVP

**Strategic pivot:** The original teacher/student spec is parked. Lighter primitives — collections (folders) and eventual access codes — replace it and serve more use cases (solo organization + teacher-style content handoff + audience curation), with less privacy surface and no asymmetric-power baggage. The teacher/student workflow remains a longer-term goal but will be re-designed on top of these primitives.

Done:
- [x] Migration `0010_collections.sql` — `collections` table (kind-agnostic, mirrors pattern visibility/attribution shape), `collection_id` FK on patterns / compositions / voice_presets, RLS, and updated `delete_account_cleanup()` to handle orphan/delete semantics.
- [x] `Collection` TS type + `lib/src/patterns/collection-ops.ts` (create / rename / setParent helpers, `applyCollectionMetadata` with the same `publishedAt` lifecycle as patterns, depth-walk `getCollectionDepth`, cycle-check `wouldCreateCycle`, `MAX_FOLDER_DEPTH = 8` constant).
- [x] Store actions: `createCollection`, `renameCollection`, `moveCollection`, `deleteCollection`, `updateCollectionMetadata`, `setPatternCollection`, `setCompositionCollection`. `Library.collections` slice added. Cloud sync round-trips collections + `collection_id` on all item types.
- [x] `clonePattern` preserves `collectionId` by default (duplicate-in-place semantics); `forkPattern` resets it to null since the source's folder belongs to a different user's library.
- [x] `createPattern` / `createComposition` accept an optional `collectionId` so new items land in the current folder, not always at root.
- [x] `PatternPickerPanel` rewritten as a tree browser: breadcrumb (Library / Guitar / Rock), clickable folder rows, "+ New folder" with inline input, "+ New pattern/composition" creates in current folder, filter narrows both folders and items, depth cap enforced at the UI level.

Deferred (need to do):
- [ ] Row actions in the picker: rename folder, delete folder (with "this contains N items" confirm), "Move to…" submenu for patterns and folders. Without these, the only way to reorganize is to create things in the right folder the first time.
- [ ] Drag-and-drop in the picker.
- [ ] Breadcrumb display on the controls bar so the user can see the active item's folder at a glance.
- [ ] Folder visibility editing UI (the schema column exists; surface a control in the metadata popover when the active item is a folder, or build a folder-level metadata view).
- [ ] Shared-folder viewer route (`?folder=<uuid>`) — read-only folder browse for non-owners, filtered by item visibility.
- [ ] Access codes — the "share a private folder with a specific recipient" mechanism that replaces teacher/student handoff. **Design captured**, build deferred. Locked decisions: edge-function validation (bypasses RLS via service role); per-kind viewers accept `?access=<code>` to route fetch through the function when present; 12-char nanoid codes; codes default to never-expire / unlimited-uses. New table `access_codes(code PK, collection_id, created_by, label, expires_at, max_uses, uses)`. New edge function `validate-access-code`. Owner UI extends `FolderSettingsDialog` with generate/list/copy/revoke. Recipient extends `SharedFolderView` with access-granted mode. **No infrastructure prep needed before the build** — current viewers, schema, and sharing flows all support extending in the access-granted direction. Full design notes in memory `project_access_codes_design.md`. Realistic effort when revived: 1.5–2 days.
- [ ] Compositions + voice presets get folder UI affordances (today only patterns surface folders in the picker; the data model + sync already cover the others).
- [ ] UX polish pass on the picker — the current tree feels clunky per user testing.

### Group I — Help / onboarding ⏳ Deferred (post-UI-polish)

Waiting until the UI surfaces stabilize. Walkthroughs are tightly coupled to specific affordances; building them against in-flux UI wastes work. Original spec preserved below for when we revisit.

- [ ] Build `example/src/help/HelpButton.tsx` — small `?` icon component
- [ ] Build `example/src/help/HelpPanel.tsx` — panel with walkthrough launcher and per-page docs
- [ ] Add HelpButton to each major page (Practice, Patterns, Sound Lab)
- [ ] Write per-page walkthroughs (script of highlighted UI elements + tooltip text)
- [ ] Settings → walkthroughs section with global toggle
- [ ] `user_settings.walkthrough_seen` persists which walkthroughs the user has dismissed

### Group J — Monetization tier scaffolding ✅ Done (billing deferred)

Two-tier model: Free (200 patterns / 100 compositions / 20 voice variants) and Pro ($2.99/mo, unlimited + future feature unlocks). Teacher tier dropped — the original justification (teaching-workflow access) is moot post-Group-H pivot. Strategy: ship cap enforcement now, layer in Pro feature unlocks (MIDI input, multi-instrument band, exports, recording) as those features get built. Stripe wiring is its own milestone.

Done:
- [x] `lib/src/subscription/` module: `Tier` type, `Subscription` type, `TIER_LIMITS`, `KIND_LABELS`, `canCreate` helper, `DEFAULT_SUBSCRIPTION` fallback. Exported from public lib surface.
- [x] `useAuthStore` gains `subscription` + upgrade-prompt state and actions. Subscription fetched alongside profile on sign-in / re-hydrate; cleared on sign-out.
- [x] `gateCreate` (extracted to `lib/src/subscription/gate.ts`) enforces caps. `usePatternsStore` gates `createPattern`, `createComposition`, `duplicatePattern`, `forkPattern`; `ensureEditingPattern` skips auto-seed only in degenerate zero-cap cases. `useVoiceStore.addVariant` gates voice-variant creation. Anon-at-cap → SignupModal; signed-in-at-cap → UpgradePrompt.
- [x] `example/src/subscription/UpgradePrompt.tsx` — modal listing Pro perks (unlimited + MIDI + multi-instrument + exports, "coming soon"). Mounted globally via `AuthCallbackHandler`.

Deferred (need to do):
- [ ] **Stripe wiring** — checkout session creation, webhook handler that updates `subscriptions.tier` + `expires_at`, customer portal link for cancel/modify. The UpgradePrompt's "Upgrade to Pro" button is currently disabled.
- [ ] **Tier-bound feature gating** — when MIDI input / multi-instrument band playback / pattern exports / audio recording ship, they'll each check `subscription.tier === 'pro'` (probably via a small `requiresPro(feature)` helper). Add gating at build-time for each feature, not retroactively.
- [ ] **TierBadge UI** — small Pro indicator in the TopBar / user menu. Skipped for now since Free is universal; meaningful when the first user actually upgrades.
- [ ] **Subscription expiry handling** — if `expires_at < now()`, treat as Free regardless of stored tier. Add a guard when Stripe lifecycle integration lands.
- [ ] **Downgrade-when-over-cap UX** — user on Pro with 250 patterns cancels. The current cap check refuses *new* creates but doesn't surface any reminder. Add a banner: "You're over the Free cap by N items. Existing content stays editable; delete down to reactivate creation, or re-upgrade."

### Group K — Verification & cleanup

Manual verification (run these in browsers before any production cutover):
- [ ] Cross-device sync test (Chrome ↔ Firefox or two profiles): patterns, compositions, voice variants
- [ ] Anon → signup → migration test (Add path and Discard path)
- [ ] Account deletion test: verify orphan handling for shared content
- [ ] Public-computer leak test: anon use, close tab, verify next tab is clean
- [ ] Sign-out clears state correctly (patterns + compositions + voice variants + active-variant refs)

Automated test follow-ups:
- [ ] `lib/tests/auth-migration.test.ts` — migration payload builder (patterns + compositions + variants + active refs)
- [ ] `lib/tests/cloud-sync.test.ts` — upserts with mocked Supabase client; covers patterns, compositions, voice variants
- [ ] `lib/tests/tier-limits.test.ts` — cap enforcement at the boundary for all three kinds (patterns / compositions / voice variants)

Completed in earlier chunks (kept here for the audit trail):
- [x] All existing `lib/tests/*` tests still pass — 228 lib tests + 5 example tests as of F.2 closeout.
- [x] Legacy `localStorage` migration shims removed (`migrateLegacyLocalStorage` in `usePatternsStore.ts` and the equivalent in the old `preset-overrides.ts` — both deleted in the F.2 dead-code sweep).

Note: the teacher/student end-to-end verification was parked along with that whole workflow per the Group H pivot. When (if) teacher/student is revived on top of collections + access codes, fresh verification scenarios will live with that work.

---

## Verification (end-to-end manual flows)

1. **Cold anon → first signup → migration: Add.** Open in incognito → app is anon, no patterns. Create 2 patterns + 1 composition + 1 voice variant. Click any account-gated action (e.g., Share) → signup modal appears. Continue with Google. SignupForm appears. Fill it out. Migration prompt: "2 patterns, 1 composition, 1 voice variant." Click Add. Cloud now has all of them.
2. **Cold anon → first signup → migration: Discard.** Same setup. Click Discard. Cloud is empty. SessionStorage is cleared.
3. **Returning signin.** Sign out. Click Sign In. OAuth round-trip. No SignupForm. Cloud content loads. No migration prompt.
4. **Reload as anon.** Open new tab. Create 1 pattern. Reload. Pattern still there. Close tab. Reopen. Pattern is gone.
5. **Sign out clears everything.** Signed-in user with library. Click sign out. UI back to anon empty state. SessionStorage empty. In-memory state reset.
6. **Public-computer leak test.** Anon creates a pattern in tab. Close tab. Open new tab. Verify nothing leaks.
7. **Cross-device sync.** Sign in Chrome. Create pattern. Sign in Firefox same account. See pattern.
8. **Share by link.** Sign in. Create pattern. Share → unlisted → copy link. Open link in different account → view + fork.
9. **Profile public/private toggle.** Set profile private. Other user sees your shared pattern; attribution is non-clickable. Toggle public. Attribution becomes clickable.
10. **Account deletion: shared content orphans.** Sign in as User A. Create public pattern. Sign in as User B. Fork User A's pattern. Sign back in as User A. Delete account. As User B, refresh: forked pattern still works; original attribution is "[Deleted User]"; User A's pattern in the catalog is "Created by [Deleted User]".
11. **Teacher / student E2E.** Sign in as teacher. Invite student by email (not yet signed up). Sign up the student via the invite link; relationship auto-claims. Teacher creates assignment with 2 patterns + 1 composition. Pushes to student with due_at = next week. Student sees in inbox. Student views items (read-only). Student forks one into their own library. Student adds a note. Teacher sees note. Teacher marks complete. Either ends relationship.
12. **Teacher deletes account.** Same setup. Teacher deletes account. Student's assignment still readable, marked orphan. New assignments impossible.
13. **Student deletes account.** Same setup. Student deletes. Teacher's roster shows "[Deleted User #abcd]" with preserved aggregate stats (e.g., "completed 5 of 7 assignments").
14. **Tier cap enforcement.** Free user at 25 patterns. Try to create another. Upgrade modal blocks.
15. **Sound Lab variants.** Sign in. Open Lab. Save 2 variants for (guitar, acoustic). Switch between them; Practice page audio reflects each. Variants persist across reload. Sign out — variants disappear locally.

---

## Design follow-ups (revisit later)

- **Menu interaction model — single popover vs. per-chip popovers.** The practice page (`HeadstockMenu`)
  and the patterns page top-controls bar both use the same shape: a compact read-only chip/bar that
  opens *one* popover containing all the editable controls. This keeps the two pages consistent for v1.
  Open question worth revisiting: should each chip in a multi-field bar (name, difficulty, genres, tags,
  visibility) be its own click-target popover instead, so the user only edits the field they're
  pointing at? Pros: more granular, less visual noise per edit. Cons: more popovers to manage, more
  code, breaks parity if applied to only one page. If we adopt per-chip popovers on the patterns page,
  we should retrofit the practice page to match so the interaction model stays unified across the app.
  Defer until after Group G ships and the catalog browse surface lands — we'll have more real usage
  to judge from.

- **Audio playback in the shared pattern viewer (`?pattern=<uuid>`).** Today the viewer renders a
  static `MiniPatternSignature` preview of the events grid — enough to glance at the shape, but
  nothing audible. Worth adding a "play" affordance so visitors can hear the pattern before deciding
  to fork. Plumbing-wise this means feeding the viewed pattern through the existing playback path
  (`Playback` singleton + metronome transport) without mutating the user's editing state. The
  challenge is that playback today reads from `usePatternsStore` / `useFretworkStore` — we'd need
  either a props-based playback render or a scoped "temporarily push this pattern into the stores
  for the duration of preview playback, restore on unmount" wrapper. Net-new sub-feature; nice-to-have
  before catalog browse but not blocking on viewer / fork / attribution work.

---

## Explicit deferrals

These are out of scope for this work despite being part of the long-arc product vision. Schema accommodates them; UI/code does not implement them yet:

- **Stripe billing integration.** `subscriptions` table exists but tier doesn't change automatically. Webhook + checkout flow is a future milestone.
- **Comments and likes on shared content.** Out of scope; not modeled.
- **Follow / following relationships.** Out of scope; not modeled.
- **Discovery / browse page.** Not part of this work. Users find content via direct links or attribution clicks.
- **Profile pages search / discovery.** No directory yet.
- **Audio recording.** Not part of this work; reserved as a Pro-tier feature.
- **Practice session logging / analytics.** Not modeled.
- **Real-time multi-device sync** (live updates without refresh). Out of scope; sync is on-mutation.
- **Multi-teacher / studio / classroom group features.** A single teacher per student-teacher relationship row.
- **Email/password and other auth providers.** Google OAuth only; architecture is provider-agnostic for future additions.
- **Identity linking** (one user, multiple providers). Reserved for when a second provider lands.
- **Account export / data download** (GDPR self-service). Not in v1; users can request via support.
- **Per-page tier-specific feature unlock** beyond library caps. The Free/Pro/Teacher gating in this work covers caps + teaching workflows; additional per-feature gating (export formats, recording, analytics) is wired in when those features ship.

---

## Open follow-ups for the user (operational, non-blocking)

- **OAuth redirect URLs.** Need to be registered in the Supabase dashboard. I'll list them during Group A; you'll add them (production Vercel URL, preview pattern, `localhost:5173`).
- **Google Cloud Console.** OAuth app must be created there; client id + secret go into the Supabase dashboard (never into the repo).
- **Migration prompt behavior on subsequent signins.** Current plan: yes, prompt every time the user signs in if session content exists. Rare case but worth confirming you're OK with that.
- **Display name uniqueness collision UX.** At signup, if the chosen name is taken, what's the error message? Suggested similar-but-available names, or just "taken, pick another"? Default: just "taken, pick another."
- **Pricing decisions.** The dollar amounts in the tier table are illustrative. Final numbers can be set whenever; the structure stands.
