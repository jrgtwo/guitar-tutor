# Supabase Integration — Auth, Cloud Persistence, Sharing, Teaching, Monetization

A long-running implementation effort. Use the **Implementation Checklist** section near the end as the operational todo list — check items off as you complete them. The rest of the doc is the rationale and reference you can return to when the checklist needs context.

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
| Anon → signed-in | Migration prompt at signup: "You made N patterns / M compositions / K voice presets during this session. Add them to your account?" All-or-nothing. Blocking modal. |
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
   - "You created N patterns, M compositions, K voice presets during this session. Add them to your account?"
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
| **Free** | $0 | ~25 patterns / 10 compositions / 3 voice presets in own library. Full catalog/community browsing. Sharing + forking work (forks count toward caps). Basic Sound Lab. No exports / recording / analytics. |
| **Pro** | $5–10/mo | Free + unlimited patterns/compositions/voice presets. Exports (MIDI/MusicXML/audio). Audio recording. Practice analytics. Multi-preset Sound Lab fully unlocked. |
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
├── ProfileEditor.tsx              # Edit own profile
└── DeleteAccountFlow.tsx          # Account deletion confirmation + execution

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

- [ ] Install `@supabase/supabase-js` in `lib/package.json`
- [ ] Create `lib/src/auth/supabaseClient.ts` with the singleton `createClient(URL, ANON_KEY)` reading from `import.meta.env`
- [ ] Add `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders
- [ ] Update `.gitignore` to ignore `.env.local`, `.env.*.local`
- [ ] Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to local `.env.local`
- [ ] Register the same env vars in Vercel (preview + production environments)
- [ ] In Supabase dashboard: enable Google OAuth provider. Configure OAuth credentials from Google Cloud Console. Register redirect URLs (`localhost:5173`, Vercel preview pattern, production domain).

### Group B — Database schema

- [ ] Create `supabase/migrations/0001_init_profiles.sql` with the `profiles` table + RLS policies
- [ ] Create `0002_patterns.sql` with `patterns` table + RLS policies + indexes
- [ ] Create `0003_compositions.sql` (mirror of patterns)
- [ ] Create `0004_voice_presets.sql`
- [ ] Create `0005_user_settings.sql`
- [ ] Create `0006_teacher_student_relationships.sql`
- [ ] Create `0007_assignments.sql`
- [ ] Create `0008_assignment_recipients.sql`
- [ ] Create `0009_assignment_notes.sql`
- [ ] Create `0010_subscriptions.sql`
- [ ] Run the migrations against the Supabase project
- [ ] Manually verify RLS: as `anon`, attempt selects on each table — should return 0 rows. Sign in as test user; verify isolation between two test users.

### Group C — Auth state + sign-in UX

- [ ] Build `lib/src/auth/useAuthStore.ts` — Zustand store with `user`, `profile`, `session`, `status: 'idle'|'loading'|'signed-in'|'signed-out'`
- [ ] Build `lib/src/auth/useAuth.ts` — hook wiring `onAuthStateChange` to the store; exposes `signIn`, `signOut`, `signInWithGoogle`
- [ ] Build `example/src/auth/SignupModal.tsx` — the universal CTA modal with the "Continue with Google" button
- [ ] Build `example/src/auth/SignInButton.tsx` — TopBar slot: shows "Sign in" when signed-out, opens a user menu when signed-in
- [ ] Build `example/src/auth/UserMenu.tsx` — dropdown with display name, "Profile," "Settings," "Sign out"
- [ ] Build `example/src/auth/AuthCallbackHandler.tsx` — handles the OAuth redirect; checks whether `profiles` row exists; routes to SignupForm or app
- [ ] Mount `<AuthCallbackHandler/>` in `example/src/main.tsx`
- [ ] Replace disabled Sign In button in `lib/src/components/TopBar.tsx` and `example/src/components/TopBar.tsx` with `<SignInButton/>`
- [ ] Build `example/src/auth/SignupForm.tsx` — first-time profile creation form with display name uniqueness check, user-type multi-select, all optional fields
- [ ] On submit, insert `profiles`, `user_settings`, `subscriptions(tier='free')` rows in one transaction (RPC function)
- [ ] Build a Supabase RPC `create_profile_with_settings` to do this atomically

### Group D — Anon → signed-in migration

- [ ] Build `lib/src/auth/migration.ts` — pure function that reads sessionStorage, builds payload of patterns/compositions/voice presets to upload
- [ ] Build `example/src/auth/MigrationPromptDialog.tsx` — blocking modal triggered after successful signup if session content exists
- [ ] Wire migration: on Add → bulk-insert into Supabase; on Discard → clear sessionStorage; in both cases, drop user into app afterward
- [ ] Switch `lib/src/patterns/store/usePatternsStore.ts` `persist`'s storage from `localStorage` to `sessionStorage`
- [ ] One-time-migration shim: on app boot, if `localStorage['fretwork:patterns:v1']` exists AND sessionStorage doesn't, copy to sessionStorage then delete the localStorage key (so existing users don't lose their work in the transition)

### Group E — Patterns/Compositions cloud sync

- [ ] Build `lib/src/cloud/patternsSync.ts` — replaces persist middleware when signed in: on every store mutation, debounce-write upsert into Supabase `patterns`; on sign-in, fetch all rows and hydrate the store; on sign-out, reset to defaults
- [ ] Build `lib/src/cloud/compositionsSync.ts` — same for compositions
- [ ] Wire both syncs to `useAuthStore`'s state changes (signed-in/signed-out triggers)
- [ ] Sign-out cleanup: clear in-memory state in `usePatternsStore`, clear sessionStorage, cancel pending sync requests
- [ ] Add cross-device test: sign in on Chrome, create pattern; sign in on Firefox same account; verify the pattern appears

### Group F — Sound Lab expansion + cloud sync

- [ ] Refactor `lib/src/playback/voices/preset-overrides.ts`:
  - `findEffectivePreset(instrumentId, family)` consults `user_settings.active_presets` first (signed-in), then committed JSON files, then shipped defaults
- [ ] Build `lib/src/cloud/voicePresetsSync.ts` — sync logic for the new `voice_presets` table
- [ ] Build `lib/src/cloud/userSettingsSync.ts` — sync for the singleton settings row
- [ ] Update `example/src/sound-lab/SoundLab.tsx`:
  - Add Variants picker dropdown per `(instrumentId, family)`
  - Add "Save as…" button + new-variant modal
  - Add Rename + Delete actions on active variant
  - Auto-save edits to the active variant
- [ ] Sound Lab cloud-vs-session: anon uses sessionStorage; signed-in uses Supabase
- [ ] Voice presets included in migration prompt at signup
- [ ] One-time-migration shim for existing `fretwork:lab-presets:v1` localStorage data: convert single-override-per-preset into one "Imported" variant per preset, mark as active

### Group G — Profile + sharing + forking

- [ ] Build `example/src/profile/ProfilePage.tsx` — public profile view at `/?profile=<displayname>` showing public fields, public content, and follow/contact affordances (when those exist)
- [ ] Build `example/src/profile/ProfileEditor.tsx` — edit form for all editable profile fields
- [ ] Add visibility toggle UI to patterns/compositions/voice presets (sidebar or item header)
- [ ] Add "Share" button that copies a link `/?pattern=<uuid>` etc.
- [ ] Build shared-content viewer routes: `?pattern=<uuid>`, `?composition=<uuid>`, `?voice-preset=<uuid>` — render read-only with "Fork to my library" CTA
- [ ] Fork action: signed-in only; gated by tier cap; insert into respective table with `forked_from_id` set; show "Forked from [Creator]" attribution
- [ ] Attribution display: clickable link to profile if profile is public; non-clickable label if private; "[Deleted User]" if deleted
- [ ] Build `example/src/profile/DeleteAccountFlow.tsx`:
  - Confirmation step (type display name)
  - Trigger Supabase admin RPC for cascading deletion + orphan handling
  - Backend RPC `delete_account(user_id)`:
    - Cascade-delete profile, user_settings, subscriptions, private patterns/compositions/voice_presets
    - Update `user_id = null` and set `display_name = '[Deleted User]'` (or similar) on shared (non-private) patterns/compositions/voice_presets
    - Set `orphaned = true` on assignments where this user is teacher
    - Cascade-delete assignment_recipients where this user is student (after archiving aggregate stats into the relationship row)
    - Update relationship rows: if user was student, set `student_deleted = true`, `student_id = null`; preserve aggregate stats columns
    - Anonymize assignment_notes authored by this user
    - Finally call `supabase.auth.admin.deleteUser(user_id)`

### Group H — Teacher / student workflows

- [ ] Build `example/src/teaching/InviteFlow.tsx`:
  - Email invite: type student's email; insert `teacher_student_relationships` row with `invite_email` + `status='pending'`; backend optionally sends email
  - Invite link: generate token, insert relationship with `invite_token`; URL like `/?invite=<token>`
  - Pre-signup pending invites are auto-claimed at the student's signup (matched by email)
- [ ] Build `example/src/teaching/StudentRoster.tsx` — teacher's view of all relationships (pending, active, ended, plus ghosted past students)
- [ ] Build `example/src/teaching/AssignmentBuilder.tsx` — pick from own patterns/compositions, set title/description/instructions, save snapshot items into `assignments`
- [ ] Build `example/src/teaching/AssignmentRecipientsManager.tsx` — within an assignment, pick students + set per-student `due_at`
- [ ] Build `example/src/teaching/AssignmentInbox.tsx` — student's read-only list of assignments received
- [ ] Build `example/src/teaching/AssignmentDetailView.tsx` — student's read-only view of an assignment with its items; mark progress; fork item button
- [ ] Build `example/src/teaching/NotesThread.tsx` — note list per `assignment_recipients` row, with author + body + timestamp; submit form with length limit; report button
- [ ] End-relationship action: either side can set `status='ended'`; future assignments blocked at the application layer

### Group I — Help / onboarding

- [ ] Build `example/src/help/HelpButton.tsx` — small `?` icon component
- [ ] Build `example/src/help/HelpPanel.tsx` — panel with walkthrough launcher and per-page docs
- [ ] Add HelpButton to each major page (Practice, Patterns, Sound Lab, Assignments-as-teacher, Assignments-as-student)
- [ ] Write per-page walkthroughs (script of highlighted UI elements + tooltip text)
- [ ] Settings → walkthroughs section with global toggle
- [ ] `user_settings.walkthrough_seen` persists which walkthroughs the user has dismissed

### Group J — Monetization tier scaffolding (no payment yet)

- [ ] Build `lib/src/subscription/tierLimits.ts` — declares the caps: `{ free: { patterns: 25, compositions: 10, voice_presets: 3 }, pro: Infinity, teacher: Infinity }`
- [ ] Build `lib/src/subscription/useSubscription.ts` — reads tier from store; provides `canCreate(kind)` helper
- [ ] Enforce caps in `usePatternsStore.createPattern`, `createComposition`, `voice_presets` create; show upgrade prompt when blocked
- [ ] Build `example/src/subscription/UpgradePrompt.tsx` — modal: "Library full. Delete something or upgrade."
- [ ] Build `example/src/subscription/TierBadge.tsx` — small indicator in TopBar
- [ ] `subscriptions` table seeded with `tier='free'` on signup; later milestone wires Stripe

### Group K — Verification & cleanup

- [ ] Cross-device sync test
- [ ] Anon → signup → migration test (Add path and Discard path)
- [ ] Account deletion test: verify orphan handling for shared content + ghosting for student
- [ ] Teacher / student end-to-end: invite → accept → assign → progress → notes → end relationship
- [ ] Public-computer leak test: anon use, close tab, verify next tab is clean
- [ ] Sign-out clears state correctly
- [ ] All existing `lib/tests/*` tests still pass (206+ as of this writing)
- [ ] Add new tests:
  - `lib/tests/auth-migration.test.ts` — migration payload builder
  - `lib/tests/cloud-sync.test.ts` — debounced upserts with mocked Supabase client
  - `lib/tests/tier-limits.test.ts` — cap enforcement
  - `lib/tests/assignment-snapshot.test.ts` — assignment item snapshot semantics
- [ ] Delete legacy `localStorage` key reads from `usePatternsStore` and `preset-overrides` (after the one-time-migration shim is no longer needed — probably 30 days post-launch)

---

## Verification (end-to-end manual flows)

1. **Cold anon → first signup → migration: Add.** Open in incognito → app is anon, no patterns. Create 2 patterns + 1 composition + 1 voice preset variant. Click any account-gated action (e.g., Share) → signup modal appears. Continue with Google. SignupForm appears. Fill it out. Migration prompt: "2 patterns, 1 composition, 1 voice preset." Click Add. Cloud now has all of them.
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
