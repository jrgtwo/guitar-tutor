# Current Status

Single source of truth for what's shipped, what's outstanding, and what's on the ideation radar. Read this at the start of a session to get oriented; update it when work lands.

Detailed historical specs / plans / migration guides live in `docs/archive/`.

---

## What this app is

A guitar / bass / ukulele practice app with a fretboard visualizer, programmable patterns, a Tone.js-based playback engine, and a Sound Lab for tuning voices. Built as a monorepo: `lib/` is the publishable engine + components; `example/` is the product shell. Persistence: anon users live in sessionStorage; signed-in users sync to Supabase.

---

## Shipped

### Auth + cloud foundation

- Google OAuth via Supabase. `useAuthStore` exposes `user`, `profile`, `session`, `subscription`, status. SignInButton + UserMenu + AuthCallbackHandler wire it together.
- First-sign-in: SignupForm collects required display name + user_types + optional profile fields; one-RPC creates `profiles` + `user_settings` + `subscriptions(tier='free')` rows.
- Anon → signed-in migration: sessionStorage contents (patterns, compositions, voice variants, reverb) get a blocking "add or discard" prompt at signup. All-or-nothing.

### DB schema

Migrations 0001 – 0011, all applied:

- `profiles`, `user_settings`, `patterns`, `compositions`, `voice_presets`, `collections`, `subscriptions`, `teacher_student_relationships` (parked), `assignments` family (parked).
- Catalog metadata (description / difficulty / genres / tags / instrument_id / published_at) on every shareable row.
- Attribution snapshot (`created_by_display_name`) denormalized so anon viewers see authorship without joining `profiles`.
- Account-deletion RPC + edge function: hard-deletes private content, orphans shared content with `[Deleted User]` attribution.
- Fork-attribution snapshot (`forked_from_creator_name`) so "Forked from X" survives source deletion.

RLS gates anon access to non-private rows; signed-in users see only their own private content.

### Patterns + compositions cloud sync

Diff-and-sync via `lib/src/cloud/sync.ts`. On sign-in, the local library hydrates from cloud; on every store mutation, debounced 500ms diff INSERTs / UPDATEs / DELETEs rows. UUIDs match between in-memory and DB so no id rewriting. Auto-seed drafts (an "Untitled" pattern created when the patterns page opens with nothing active) are excluded from sync until the user mutates them.

### Sound Lab (multi-variant)

The Sound Lab tunes voice variants. Five fixed `(instrumentId, family)` slots ship code-constant defaults from `lib/src/playback/voices/presets.ts`. On top, users create named **variants** scoped to a slot, organized into folders, with one active variant per instrument tracked in `user_settings.active_presets` (jsonb map).

- Resolver: `resolveActiveVoice(instrumentId)` falls back through user-variant → default → first-default-for-instrument.
- Defaults are read-only. Edits land in ephemeral `pendingPreset` state; explicit Save / Save-as-new-variant required to persist.
- Dirty-state guards on instrument tab switch, variant switch, and full-page nav.
- "Variant JSON" section provides a copy-to-clipboard export of the active variant's preset (reverb excluded — reverb is a global master-bus setting, not per-variant).
- Anon variants live in sessionStorage `fretwork:lab-presets:v1` schema v2; signed-in variants round-trip through `voice_presets`.

### Shared library picker

`example/src/library/LibraryPickerPanel.tsx` is the kind-agnostic folder/item picker used by Patterns / Compositions / Sound Lab voice pickers. Renders breadcrumb + filter + folders + items + "+ New folder" + "+ New item." Folder rows have hover-revealed Rename / Move / Delete actions, opening dedicated dialogs:

- `FolderSettingsDialog` — rename + visibility (private / unlisted / public)
- `MoveFolderDialog` — picks a new parent, with `wouldCreateCycle` + `MAX_FOLDER_DEPTH` enforcement
- `DeleteFolderDialog` — counts patterns + compositions + variants + subfolders before confirming; orphan-to-root semantics matching the DB

### VoicePickerChip

Compact "current voice" chip in the popover style. Mounted in three places: Sound Lab header (with mutations enabled), Practice metronome strip (replacing the old acoustic/electric toggle), Patterns page controls bar. Pinned defaults on top, folder-organized user variants below.

### Patterns page controls bar

The pattern/composition chip lives on a sticky bar above the editor. Above the chip, a small breadcrumb (`Library / Rock / Lead`) renders when the active item lives inside a folder — gives folder context without opening the picker. To the right of the chip sits the VoicePickerChip scoped to the active item's instrument.

### Patterns page metronome + tempo/groove model

`PatternsMetronomeStrip` mounts below the playing surface on both Edit and Arrange tabs (eye-economy: adjacent to whatever the user is looking at). Reuses the practice strip's `BeatDot` / `SubdivisionDot` / `useBeatFlash` primitives — animated beat dots reflect the active source's time signature × the user's subdivision setting. Strip is the single source of transport: play/stop, BPM stepper, groove picker, click-mute and volume in an overflow popover. Old duplicate controls were stripped from `EditorToolbar` and the arranger toolbar.

Pattern + Composition gained tempo/groove authoring fields:

- `Pattern.suggestedBpm: number | null` and `Pattern.groove: GrooveSpec | null` — author's preferences. Null = no opinion, metronome uses whatever it has.
- `Composition.tempoMode: 'global' | 'inherit'`, `Composition.groove`, `Composition.grooveMode` — global wins, or each placement plays at its source pattern's bpm/groove with comp values as the fallback.
- Time signature stays pattern-owned with no override path (TS *is* the music; "playing 7/8 in 4/4" isn't a real use case).
- Subdivision stays practice-time only — how you want the click to feel, not part of the music.

`resolveEffectivePlayback(comp, placement)` computes the audible bpm/groove per placement (pure function, also fed into the arranger's read-only inheritance annotations on placement blocks). In inherit mode, `EventScheduler.onPlacementChange` fires at boundary ticks; `usePatternsPlayback` resolves new values and pushes them into the metronome live — sample-accurate, no React-rAF latency on tempo changes. In global mode the comp's values are pushed once at play-start and stay put.

Bidirectional binding: editing BPM or groove on the strip writes through to the active pattern/composition (no separate save step). Opening a pattern auto-loads its preferences into the metronome. During inherit-mode composition playback, strip controls go read-only and display the currently-audible values to avoid "I edited 80 but I'm hearing 160" confusion.

`GroovePicker` widget (preset dropdown + custom swing slider + appliedTo radio) is reused by both the strip and `ItemMetadataPanel`. Presets: `Straight / Swing 8ths / Shuffle / 16th Swing / Custom`. Swing values use the metronome's existing [0.5, 0.75] range to avoid conversion at the boundary. New fields ride in the jsonb `data` column and hydrate with safe defaults for legacy rows — no SQL migration.

### Catalog page

`?page=catalog` — personal library browser across all kinds. Top filter row (Search / Kind / Instrument / Show empty folders). Folder tree with kind-aware counts. Each row opens its kind's editor or shared viewer. Catalog link in TopBar nav highlights when active (same `navLinkClass` helper Practice + Patterns use).

### Sharing surfaces

All anon-accessible via Supabase RLS on non-private rows:

- `?pattern=<uuid>` — `SharedPatternView`: metadata + signature preview + Fork CTA
- `?composition=<uuid>` — `SharedCompositionView`: metadata + placement list + Fork CTA (with `forkComposition` store action)
- `?voice-preset=<uuid>` — `SharedVoicePresetView`: metadata + live audition deck + Fork CTA (with `forkVariant` store action)
- `?folder=<uuid>` — `SharedFolderView`: folder browse with subfolders + mixed-kind items, each linking into its per-kind viewer

Fork CTAs gate anon → SignupModal; signed-in users go through `gateCreate` for tier-cap enforcement. Forks snapshot the source creator's display name onto the new row so "Forked from X" survives any later changes to the source.

### Profile + account deletion

- `?profile=<displayname>` — public profile page
- `?settings=1` — profile editor (display name is locked once set)
- DeleteAccountFlow with multi-step confirmation, RPC + edge function

### Monetization tier scaffolding

Free / Pro tiers. Free caps: 200 patterns / 100 compositions / 20 voice variants. `gateCreate` (in `lib/src/subscription/gate.ts`) enforces on every create / duplicate / fork / auto-seed across all three kinds. Anon-at-cap → SignupModal; signed-in-at-cap → UpgradePrompt. Stripe wiring is intentionally deferred — the upgrade button is disabled until Pro has real unlocks.

### TopBar navigation

`Practice / Patterns / Catalog` nav links with active-route highlighting via shared `navLinkClass`. Settings + SignInButton (or UserMenu when signed in) on the right.

---

## Outstanding

Each item is genuinely unstarted or genuinely half-built. Manual verification is listed even though we said "skip for now" because it represents real risk before any production cutover.

### Sound Lab defaults

- **Tune the 4 non-acoustic-guitar defaults.** Electric guitar, acoustic bass, electric bass, and acoustic ukulele are at the source-code baseline in `presets.ts`. Editing requires hand-editing the TypeScript file or building the admin portal below.

### Admin portal for default presets

- "Publish active variant as the shipped default" UI in the Sound Lab, gated to an admin user-id list. Needs a `committed_presets` Supabase table with admin-only RLS, an admin role check in `useAuthStore`, and a resolver hop that consults the committed layer between user variants and `presets.ts` defaults. ~1–2 days of focused work. Full notes in memory `project_admin_portal_for_default_presets.md`.

### Library polish

- **Drag-and-drop reorganization** across all pickers + catalog. Today the only path is the "Move to…" dialog; DnD would be a UX upgrade. Realistic effort ~1 day, mostly fighting drag/touch/cycle-prevention edge cases. A library would help (`@dnd-kit/core` or `react-dnd`).
- **Unify the catalog folder rendering with `LibraryPickerPanel`.** Catalog is the architectural one-off — every other folder surface uses LibraryPickerPanel. Extract a `<FolderRow>` and have catalog use it before any folder-UI design polish, so the redesign lands in one file. Full notes in memory `feedback_unified_folder_ui.md`.
- **Folder-UI design pass.** Acknowledged as needing a redesign; should be done after the architectural unification above.

### Access codes (D.6)

- Per-recipient revocable folder grants. Replaces the parked teacher/student handoff. **Design captured, build deferred.** Locked decisions: edge-function validation (bypasses RLS via service role), per-kind viewers accept `?access=<code>` to route fetch through the function, 12-char nanoid codes, default never-expire / unlimited-uses. New `access_codes` table; new `validate-access-code` edge function; owner UI in `FolderSettingsDialog`; recipient extends `SharedFolderView`. Current infrastructure supports it without breaking changes. Realistic effort ~1.5–2 days. Full notes in memory `project_access_codes_design.md`.

### Monetization plumbing

- **Stripe wiring** — checkout session creation, webhook → `subscriptions.tier` + `expires_at`, customer portal. Upgrade button is currently disabled.
- **`requiresPro(feature)` helper** — wire when each gated feature ships (MIDI input, multi-instrument band, exports, recording).
- **TierBadge UI** — Pro indicator in TopBar / user menu. Skipped until anyone actually has Pro.
- **Subscription expiry handling** — treat `expires_at < now()` as Free regardless of stored tier.
- **Downgrade-when-over-cap banner** — Pro user with N > Free-cap items cancels Pro; needs a banner explaining their existing content stays editable while creates are blocked until they delete down or re-upgrade.

### Metronome bug pass

Known-but-unfixed issues in the metronome itself surfaced during the patterns-page work but were intentionally deferred so the tempo/groove model could land cleanly. Specifics are in the head of the project owner; revisit before any release that leans on metronome correctness.

### Help / onboarding

- HelpButton + HelpPanel per major page, scripted walkthroughs, `user_settings.walkthrough_seen` persistence. Explicitly deferred until UI surfaces stabilize so walkthroughs don't get rewritten on every polish pass (see memory `project_defer_group_i_walkthroughs.md`).

### Variant Import

- Single-variant clipboard / file import to mirror the Variant JSON export. Build when there's a real workflow that needs it.

### Verification

- **Manual cross-device sync test** (Chrome ↔ Firefox or two profiles): patterns, compositions, voice variants.
- **Anon → signup migration test** — both Add and Discard paths.
- **Account-deletion test** — orphan handling for shared content.
- **Public-computer leak test** — anon use, close tab, verify next tab is clean.
- **Sign-out clears state correctly** for all three kinds + active-variant refs.

### Automated test follow-ups

- `lib/tests/auth-migration.test.ts` — migration payload builder.
- `lib/tests/cloud-sync.test.ts` — upserts with mocked Supabase client across all three kinds.
- `lib/tests/tier-limits.test.ts` — cap enforcement at the boundary for patterns / compositions / voice variants.

---

## Ideation / future features

Forward-looking concepts that haven't been planned yet. Add notes here when ideas land; they get promoted to "Outstanding" when they're ready for serious work.

### Multi-instrument band playback (probable Pro feature)

User wants the app to play multiple instruments simultaneously — full band playback with track / mixer controls (volume, pan, mute, solo, reverb send per track + master FX). Discussed in detail; aligns with existing architecture:

- Insert FX stay per-voice (already in `VoicePreset.effects`)
- Reverb stays global on master bus (compute cost + acoustic realism + standard DAW practice)
- Per-track reverb-send dial is the missing piece — gives "wetness per voice" without each voice running its own reverb engine
- New Track abstraction would live on Composition (a composition becomes a multi-track project)
- `Playback.setInstrument` would become multi-voice; metronome already broadcasts ticks to multiple subscribers

Realistic effort ~1–2 weeks. Risks: Tone.js audio-thread saturation with 4+ simultaneous voices + effects chains; multi-track pattern scheduling needs phase-locked beat sync; mixer UI design (small dials/faders/meters) isn't trivial.

### Tempo automation timeline on compositions

DAW-style `{atTick, bpm}` events on a composition for tempo ramps and mid-piece changes beyond what the current global/inherit toggle expresses. Captured during the patterns-page metronome design as the long-term direction; not built. Per-placement BPM override (a third mode beyond global/inherit, letting users tweak one section's tempo without changing the source pattern) is a smaller intermediate step on the same axis.

### (Add new feature ideation here)

---

## Conventions to remember

- **Anon users persist to sessionStorage** (survives reload, dies on tab close); signed-in users sync to cloud.
- **All git operations are run by the project owner.** Never `git add` / `commit` / `push` / `rm` from the agent side.
- **Typecheck command is `npm run build`** (it runs `tsc -b` before Vite). Do not invoke `tsc` / `npx tsc` / `pnpm exec tsc` directly.
- **No `<a href>` in-app navigation** — use the SPA router. Bare anchors wipe URL-persisted store state.
- **Unified folder UI is the rule** — every folder rendering uses `LibraryPickerPanel`'s row component. Catalog is the one architectural holdout; unify before any folder-UI polish.
- **Per-item approval for changes** — present the diff and wait for explicit per-item approval; don't assume prior approval carries across items.
- **Light context, not walls of text** — short focused messages, list sub-topics up front and walk through one at a time.

---

## Right now (session-continuity snapshot)

**Most recent work, 2026-05-17:** Patterns page metronome + tempo/groove model (see "Patterns page metronome + tempo/groove model" under Shipped). 19 files modified, 6 new files, +745 / -111 lines, all changes uncommitted at session end. Build clean, 267 tests green, manually verified including a small z-index fix on the metronome section wrappers so `SimplePopover`'s panels (groove picker, overflow `⋯`) stack above the timeline.

Design spec: `docs/superpowers/specs/2026-05-17-patterns-metronome-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-17-patterns-metronome.md`

**Natural next thread:** Metronome bug pass. The user has known-but-unspecified metronome issues they explicitly parked until the tempo/groove work landed. Ask them to surface specifics at the start of the next session before guessing.

**Other open threads from this session, not started:**
- Final cross-file code-quality review subagent on the metronome change set — was offered, user opted to ship without it. Can still be dispatched if they want a second pass before merging.
- Composition's legacy `timeSignature` field is dead at runtime now (every placement carries its own TS) but the field is still in the type and still written. Dropping it is a separate cleanup pass.
