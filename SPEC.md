# Fretwork — Product Spec

A full-neck fretboard visualization tool for studying scales, arpeggios, and (eventually) chord shapes — with a metronome and timed playback layered on top.

> This is the working spec, kept in sync with the repo. It supersedes the original PDF (`Fretwork.pdf`) and reflects the actual state of the codebase as of v0.1.

---

## Mission

Existing online fretboard tools mostly show small 6–8 fret diagrams of scales and chord shapes. There's a gap: a clean, beautiful, **full-neck visualization** that lets a player see how a scale, arpeggio, or chord lives across the entire neck. Fretwork fills that gap.

Built primarily as a reference/study tool for intermediate-to-advanced guitarists, but designed so beginners can use it too. Bass and ukulele are first-class instruments, not afterthoughts.

---

## Core principle

The fretboard is the hero. Every UI decision should serve "let the player see the neck clearly." Controls should be accessible but never compete with the visualization for attention.

---

## Aesthetic direction

Warm, wood-textured, "studio" feel:

- Deep charcoal warm dark UI (not cold black)
- Rosewood/ebony fretboard with subtle grain
- Brushed nickel/silver frets with bright leading edges
- Mother-of-pearl inlays at standard positions
- Strings rendered with thickness gradient (low strings thick, high strings thin) and wound vs. plain coloring
- Glass-button note markers with depth (drop shadow + highlight)
- Color-coded scale degrees: amber root, coral 3rd, sage 5th, cream scale tones
- Typography: humanist sans for UI (Segoe UI / equivalent), monospace for technical readouts (JetBrains Mono / equivalent) — fret numbers, tunings, BPM, status displays

---

## Information architecture

### Top control bar

The primary control surface. Mode-aware: segments adapt based on current mode and instrument.

**Always visible:**

- **Instrument** — Guitar, Bass, Ukulele *(new since original spec)*
- **Mode** — Scales, Arpeggios, Notes *(Chords deferred to a later phase; see Build phases)*
- **Key** — root note (C, C#, D, … B)
- **Type** — list adapts to mode (scale types when Mode=Scales, arpeggio qualities when Mode=Arpeggios, note name when Mode=Notes)
- **Tuning** — filtered to the active instrument (e.g. selecting Bass swaps the tuning list to bass tunings)
- **Capo** — fret position or "off"
- **Labels** — Notes / Intervals / Blank
- **Metronome** *(new since original spec)* — compact BPM/time-signature/play surface; expands into a draggable floating panel

**Visible in Chord mode only (future):**

- **Voicing** — appears between Type and Tuning. Lists available shape templates for the selected chord quality (CAGED-system: Open, A-shape, E-shape, etc.).

### Settings overlay (gear icon, top-right)

Less-frequently-changed preferences:

- Handedness (right / left)
- Color by scale degree (on / off)
- Highlight root note (on / off)
- Show ghost markers in Chord mode (on / off) *(designed-for, not yet implemented)*
- Audio settings (placeholder section, disabled)
- Account settings (when accounts ship)

### Fretboard

The full neck view, occupying the maximum available space below the top bar. Fret count is per-instrument: **guitar 22, bass 21, ukulele 15.**

- Headstock area on the left with open-string labels (note + octave: e.g. guitar standard E2, A2, D3, G3, B3, E4)
- Capo, when active, drawn as a visual bar across the indicated fret
- Note markers placed mid-fret on each string
- Fret numbers above the neck (mono font)
- Inlay dots at standard positions (3, 5, 7, 9, 12-double, 15, 17, 19, 21)
- Reentrant tunings (e.g. ukulele G-C-E-A) rendered at their visual position even when the note isn't the lowest pitch

### Below the fretboard

Contextual info card showing what's currently displayed:

- Title (e.g., "A MAJOR SCALE")
- Notes spelled out with degree numbers
- Brief contextual note ("Diatonic, Mode I" or similar)
- Color legend for the marker scheme

### Playback controls *(new since original spec)*

When Mode=Scales, a compact playback bar appears that lets the user:

- Pick a playback pattern (see **Playback** section below)
- Play / pause / stop the scale on a synthesized guitar tone, timed to the metronome
- Enter "programming mode" for the **Custom** pattern, which exposes an instructional banner and lets the user click cells on the fretboard to build a sequence

---

## Modes (in detail)

### Scales

**Algorithmic.** Define a scale as a set of pitch class offsets from the root.

```
{ id: "major", name: "Major (Ionian)", intervals: [0, 2, 4, 5, 7, 9, 11] }
{ id: "minor-pentatonic", name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] }
```

Renderer lights up every instance of those pitch classes across the entire neck.

**Currently shipped:** 12 scales — Major (Ionian), Dorian, Phrygian, Lydian, Mixolydian, Natural Minor (Aeolian), Locrian, Harmonic Minor, Melodic Minor, Major Pentatonic, Minor Pentatonic, Blues.

### Arpeggios

**Algorithmic.** Same data structure as scales, just smaller pitch sets.

```
{ id: "major-7-arp", name: "Major 7", intervals: [0, 4, 7, 11] }
{ id: "minor-7-arp", name: "Minor 7", intervals: [0, 3, 7, 10] }
```

Same rendering treatment as scales. **Currently shipped:** 12 arpeggio types covering triads, sevenths, sus, diminished, half-diminished.

### Notes

**Algorithmic.** Light up every instance of a single chosen note across the neck. Useful for fretboard memorization. Type dropdown becomes the note picker in this mode.

### Chords *(not yet implemented)*

**Library-driven.** Hand-crafted shape templates stored in a database.

Each shape definition includes:

- Quality (Major, Minor, 7, Maj7, Min7, etc.)
- Voicing label (Open, A-shape, E-shape, etc.)
- Anchor fret (where the root sits, relative to the shape)
- Per-string positions: which fret, which finger, or muted (X)
- Author and verification status (for community submissions)

Shapes are stored as **relative patterns** so they transpose freely across all 12 keys by sliding up the neck. One authored "A-shape Maj7" template covers all 12 keys for free.

**Visualization treatment:** Active voicing rendered prominently with finger numbers inside markers; other instances of the chord's notes across the neck rendered as ghosted/translucent markers (configurable on/off in settings).

**No fallback for unsupported chord types.** If the library doesn't have a shape for the requested chord, that quality simply doesn't appear in the Type dropdown. Constrained input prevents broken states.

---

## Instruments *(new section since original spec)*

The visualizer is instrument-agnostic. Switching the **Instrument** dropdown updates the string count, fret count, default tuning, and the available tuning list:

| Instrument | Strings | Frets | Default tuning | Other tunings shipped |
|---|---|---|---|---|
| Guitar | 6 | 22 | Standard (E2-A2-D3-G3-B3-E4) | Drop D, DADGAD, Open G, Open D, Half-Step Down |
| Bass | 4 | 21 | Standard (E1-A1-D2-G2) | Drop D |
| Ukulele | 4 | 15 | Standard / reentrant (G4-C4-E4-A4) | Low G, Baritone |

Switching instruments preserves the user's current key, mode, type, and capo (clamped to the new instrument's fret count). The tuning resets if the prior tuning belonged to a different instrument; otherwise the user's choice is kept.

---

## Capo

A capo is rendered as a **visual element on the fretboard**, not just a numeric setting. When set to fret N:

- A bar is drawn across the fretboard at fret N
- Open-string labels in the headstock update to reflect the new effective tuning (e.g., capo at 5 in standard tuning shows A2, D3, G3, C4, E4, A4)
- All scale/arpeggio/chord computations treat fret N as the new "fret 0"
- The area to the left of the capo is dimmed or de-emphasized

This teaches the player *why* the capo changes things, not just shows them the result.

---

## Metronome *(new section since original spec)*

A click track with:

- BPM control (numeric + tap tempo if added later)
- Time signature picker (common signatures shipped: 4/4, 3/4, 6/8, etc.)
- Subdivision indicators — beat dots that animate on the downbeat and subdivisions
- Click sound selection (multiple synth presets)
- Compact mode (lives inline in the top bar) and an expanded floating panel that's draggable
- Shared singleton: every component reading the metronome state sees the same instance, so playback can lock to the same clock

The metronome lives in `@fretwork/lib` so consumer apps can reuse it; the example app composes it into the top bar.

---

## Playback *(new section since original spec)*

Click-to-play synthesized guitar audio that walks through the currently displayed scale or arpeggio, timed to the metronome.

**Shipped patterns:**

- **Ascending pitch** — plays scale tones in pitch order across the neck.
- **String by string** — walks each string low-to-high, playing all in-scale notes on that string before moving to the next.
- **CAGED — five hand-authored scale boxes** — see the dedicated section below.
- **Custom** — user-programmed sequence. Entering programming mode exposes a banner and lets the user click cells on the fretboard in order; each click adds the cell to the sequence with a numbered badge. The next play uses that sequence.

### CAGED scale shapes

Each CAGED shape (C, A, G, E, D) is defined as a hand-authored list of cells expressed as `(stringIndex, offset, degree)`, where the offset is the fret offset from the shape's anchor root and the degree is its scale-degree in the parent major (1–7). Anchors are conventional:

| Shape | Anchor string | Reference root |
|---|---|---|
| C | A string | scale tonic on A |
| A | A string | scale tonic on A |
| G | low E string | scale tonic on low E |
| E | low E string | scale tonic on low E |
| D | D string | scale tonic on D |

The resolver positions each shape at the **lowest valid neck occurrence** of the anchor pitch class — the lowest fret where (a) the anchor cell itself is reachable, and (b) at least 8 of the shape's cells fall inside `[capo, fretCount]`. Cells that fall behind the nut or capo (e.g. open-position E-shape's offset −1 cells for E major) are dropped silently.

**Per-key position numbering.** The dropdown labels each shape `Position N — X shape`, where N is its rank by lowest fret in the active key. So C major shows `Position 1 — C shape, Position 2 — A shape, ...`, while E major shows `Position 1 — E shape, Position 2 — D shape, ...`. The CAGED letter is intrinsic to the shape; the position number is contextual.

**Playback order is up-and-down.** For each shape the resolver builds an ascending pass (low string → high string, each string's cells in fret-ascending order) followed by a descending pass (high → low, each string's cells in fret-descending order). The apex (highest note) is played once; the lowest note appears at both the start and the end.

**Scale family coverage.**

| Scale | Shape source | Anchor pitch class |
|---|---|---|
| Major (Ionian) | Authored major shapes | scale tonic |
| Dorian / Phrygian / Lydian / Mixolydian / Aeolian (natural minor) / Locrian | Major shapes | parent major's tonic (computed from the mode) |
| Major pentatonic | Major shapes filtered to degrees 1, 2, 3, 5, 6 | scale tonic |
| Minor pentatonic | Major shapes filtered to degrees 1, 2, 3, 5, 6 | relative major's tonic |
| Harmonic minor | Authored — derived from major shapes by lowering the 3rd and 6th cells one fret | scale tonic |
| Melodic minor (jazz) | Authored — derived from major shapes by lowering the 3rd cells one fret | scale tonic |
| Blues | Not yet authored — CAGED entries are hidden in the dropdown | — |

Modes share their parent's physical box positions because they share the parent major's note set; only the visual root highlight differs. Pentatonics emit a strict subset of the parent's cells. Harmonic and melodic minor shapes are derived programmatically from the major shapes — verified against the Jens Larsen 5-position references — so the same anchor frets apply, with two specific cells nudged a fret lower for HM (♭3 and ♭6) or one for MM (♭3).

**Audio engine:** Tone.js with a plucked-string synthesizer (`PluckSynthInstrument`). Lives in `@fretwork/lib` alongside the metronome.

**UI (in the example app):** pattern selector, play/pause/stop, programming banner.

This feature was originally planned for Phase 3 (post-launch audio). It's been pulled forward; see Build phases.

---

## User accounts and tiers

### Anonymous user (no account) — current state

Full access to the core tool. Nothing is feature-gated.

- Browse all modes, all scales/arpeggios
- All instruments, tunings, capo positions
- All display settings
- Use shareable URLs to bookmark or send specific configurations

Optional: limited persistence via `localStorage` (e.g., last-used config) so a returning anonymous user doesn't lose everything on tab close. *(Not yet implemented — URL state is the only persistence today.)*

### Registered user (free account) — not yet built

Adds persistence and contribution capabilities:

- Unlimited saved configurations across devices
- Favorite chord shapes
- Save custom tunings
- Submit chord shapes / scales / tunings to the community library (with attribution)
- Personal "known / learning / mastered" tracking on scales and chords
- Personal learning plans (basic — a list of things to study)

### Pro user (future tier, post-launch) — not yet built

Reserved for genuinely premium features once they exist:

- Spaced repetition / advanced practice tools
- Ear training mode
- Ad-free experience (if/when ads are introduced)
- Possibly: unlimited custom tunings beyond a free-tier cap

> **Note on Pro framing:** the original spec gated audio playback behind Pro. Audio has shipped for free. Pro tier needs a new value proposition — likely the practice/learning tools, ear training, and ad-free experience. Database schema should still accommodate a `tier` field on users from day one.

---

## Sharing

Shareable URLs encode complete state in query parameters:

```
fretwork.app/?mode=scales&key=A&type=major&tuning=standard&capo=0&labels=intervals
```

State read/write is automatic — every user interaction updates the URL.

**Gap:** no explicit "Copy link" button in the UI yet. Users can copy from the address bar, but a one-click affordance is a Phase 1 finishing item.

This replaces the need for explicit "social" features. The unit of sharing is a configuration, not a profile.

---

## Community contributions *(deferred to post-launch)*

User-submitted chord shapes, scales, and tunings become part of the library after review. Submission flow, moderation queue, and contributor roles all deferred. Database schema should still accommodate from day one:

- `author_user_id` (nullable for built-in library)
- `verified` boolean
- `submitted_at`, `verified_at` timestamps
- `verification_status` (pending, approved, rejected)

Roles to leave room for: standard user, verified contributor, moderator.

---

## Monetization

**Phase 1 (launch):** No monetization. Build an audience and validate the product. Optional "support this project" link if desired, but don't make it prominent.

**Phase 2 (post-launch, traffic growing):** Modest AdSense banner in low-impact locations (footer, marketing pages, between practice sessions if practice mode exists). **Never near the fretboard itself.**

**Phase 3 (audio and learning features ship):** Pro tier introduced. Pro unlocks the genuinely premium stuff (advanced practice tools, ear training, ad-free). Free tier remains a complete reference for the visualization and basic audio use case.

**Phase 4 (audience established):** Replace AdSense with direct sponsorships from guitar-adjacent brands (string manufacturers, lesson platforms, software companies). Higher value, better-aligned, cleaner experience.

---

## Build phases — current state

> The original spec had audio in Phase 3 and chord mode in Phase 2. The actual build order has diverged: audio (metronome + playback + custom programming) jumped ahead of accounts and chord mode because the inspiration was there. The phases below reflect what's done and what remains.

### Phase 1 — launch (v1) — 90% complete

Core reference tool, no accounts.

- ✅ Fretboard rendering: full neck per instrument, logarithmic spacing, visual polish
- ✅ Top bar control surface (Instrument · Mode · Key · Type · Tuning · Capo · Labels)
- ✅ Modes: Scales, Arpeggios, Notes
- ✅ Multi-instrument support: guitar, bass, ukulele *(beyond original Phase 1 scope)*
- ✅ Tunings: 6 guitar, 2 bass, 3 ukulele
- ✅ Capo as visual element
- ✅ Labels toggle (Notes / Intervals / Blank)
- ✅ Color-by-degree system
- ✅ Settings overlay (handedness, color toggle, root highlight)
- ✅ Shareable URLs (state encoding)
- ✅ Anonymous use, no auth
- ✅ Library / consumer-app split (`@fretwork/lib` + example app)
- ⚠️ **Copy share link button** — URL state exists, UI affordance does not
- ⚠️ **Mobile / tablet responsive pass** — current SVG has `min-w-[820px]` and horizontal-scrolls on phones; needs a deliberate decision on whether that's acceptable or whether the layout adapts further
- ⚠️ **localStorage fallback** for last-used config on returning anonymous users (optional)

### Phase 1.5 — audio (pulled forward from original Phase 3)

Already shipped:

- ✅ Metronome (BPM, time signatures, click sounds, compact + expanded UI)
- ✅ Scale playback timed to the metronome (Tone.js plucked-string synth)
- ✅ Playback patterns: Ascending pitch, String by string, CAGED E/D/C/A/G
- ✅ Custom pattern programming (click cells on the fretboard to build a sequence)

Remaining for an audio v1 polish pass:

- Arpeggio playback (currently scale-focused; arpeggios likely work but need verification)
- "Click-to-hear" individual note (tap any cell to play just that note, outside playback mode)
- Audio settings panel (volume, instrument tone selection) — currently a disabled placeholder

### Phase 2 — accounts and chord mode

- Auth via Supabase (or equivalent: Neon + own auth, NextAuth, etc.) — magic link or OAuth
- Saved configurations
- Favorites
- Custom tunings (user-defined)
- **Chord mode added:** initial library of ~30 shape templates
  - Major, Minor, 7, Maj7, Min7, Min7♭5
  - Each across 5 CAGED voicings where applicable
- Chord visualization (active voicing + optional ghost markers)
- Submission flow exists in the database schema; UI deferred or hidden

### Phase 3 — learning features and Pro tier

*(Audio used to be here; now this is the learning-focused phase.)*

- Mark scales / chords / arpeggios as "known," "learning," "mastered"
- Personal learning plans
- Spaced repetition / fretboard memorization games
- Ear training mode
- Pro tier introduced (gates the advanced practice tools, not the basic audio)

### Phase 4 — and beyond

- PWA / offline support
- Native mobile app (maybe)
- Lesson plan tools for teachers (maybe)
- Direct sponsorships replacing AdSense

---

## Technology stack — current

- **Monorepo:** npm workspaces with two packages — `lib/` (the reusable library, published as `@fretwork/lib`) and `example/` (the consumer app demonstrating the library).
- **Frontend:** React 18, TypeScript, Vite 6.
- **Styling:** Tailwind CSS 3 + shadcn-style UI primitives, with a CSS-token theming layer (`styles/tokens.css`).
- **State:** Zustand stores — one for fretwork visualization state, one for metronome, one for playback. URL state syncs the fretwork store on every change.
- **Audio:** Tone.js 15 — used for both the metronome click and the plucked-string playback synth.
- **Visualization:** SVG rendered by React, driven by per-instrument layout constants. No canvas; the SVG approach makes accessibility, theming, and inspector debugging straightforward.
- **Backend:** Not yet present. Supabase or Neon planned for Phase 2.
- **Hosting:** Not yet deployed; Vercel + Supabase / Neon assumed.
- **Data:** Scale, arpeggio, tuning, instrument, and CAGED-traversal definitions live in code (`lib/src/lib/*.ts` and `lib/src/playback/patterns/*.ts`). Chord library will live in a database from Phase 2.

---

## Out of scope (explicit non-goals)

To keep the product focused:

- **No social features.** No public profiles, no following, no comments on shapes. Sharing happens via URLs, not via a social graph.
- **No PDF export at launch.** Possibly an offline app or PWA later, but no print/export feature.
- **No tablature display, no song playback, no chord progression sequencing.** The playback that exists is for studying a single scale/arpeggio against a metronome — not transcribing songs.
- **No teacher/student management at launch.** May come later.
- **No social login required.** Anonymous use is a first-class experience, not a degraded one.

---

## Design decisions log

Quick reference for *why* things are the way they are:

| Decision | Reasoning |
|---|---|
| Top bar as primary control surface | Prevents the "sidebar competing with the fretboard" problem. Keeps the neck the hero. |
| No left navigation rail | Was redundant with mode tabs. One source of truth for navigation. |
| Settings overlay vs. sidebar | Settings are a "configure once" task, not a "watch while you play" surface. |
| Algorithmic scales/arps, library-driven chords | Scales are pure data; chord shapes are human design decisions. Different problems, different solutions. |
| Constrained chord input (no fallback) | Prevents broken states. If a shape doesn't exist, that combination doesn't appear in dropdowns. |
| Capo as visual element | Teaches the player *why* it works, doesn't just silently shift numbers. |
| Sharing via URL, not profile | Lower friction. No social graph required. Configs are the unit of sharing. |
| No PDF export | User decision; offline app possible later. |
| Ads before subscription | No premium features exist yet. Don't charge for what isn't built. |
| **Library / consumer-app split** *(new)* | Keeps the visualizer reusable in other apps without dragging in audio dependencies. The lib's `TopBar` is metronome-free; the example app composes a metronome-aware version on top. |
| **Audio pulled forward from Phase 3** *(new)* | Inspiration struck. Building audio while the visualizer was fresh produced a better feel than retrofitting it later, even at the cost of phase ordering. |
| **CAGED ships first as playback paths, not chord shapes** *(new)* | The CAGED concept is useful immediately as a way to traverse a scale shape, even before the chord-shape library exists. The chord-shape library remains the right home for actual chord voicings; these are complementary, not redundant. |
| **Multi-instrument from launch** *(new)* | Bass and ukulele use the same algorithmic engine; supporting them was cheap and broadens the audience. The cost is mostly UI: an extra dropdown and per-instrument tuning lists. |
