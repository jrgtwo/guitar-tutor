# Fixes Needed

A punch list of code-quality issues found during audits. Each entry has a
priority bucket, file:line refs, and a one-line "what to do."

Sections:
- `lib/` — completed audit (2026-05-13)
- `example/` — TODO

---

## `lib/` audit

### 🔴 Real bugs

#### ~~L1. Leaked `metronome.on('stop', ...)` subscription~~ ✅ Fixed
**Where:** `lib/src/playback/Playback.ts:71`
**Problem:** The stop handler is registered without storing its unsub. `dispose()` cleans up `_unsubTick` and `_unsubSubdivision` but not this one — the closure stays in the metronome's listener set after dispose, holding the Playback instance.
**Fix:** Added `_unsubStop` field; stored the return of `metronome.on('stop', ...)`; cleaned up in `dispose()`.

#### ~~L2. Dead-eyed ternary in `setEnabled`~~ ✅ Fixed
**Where:** `lib/src/playback/usePlaybackStore.ts:59`
**Problem:** `set({ enabled, currentPlayheadCell: enabled ? null : null })` — both branches return `null`. Every `setEnabled(true)` wipes the playhead, causing a one-frame flicker on play.
**Fix:** Conditional spread — only clear `currentPlayheadCell` when disabling.

**Open follow-ups (not addressed here):**
- `toggleEnabled` (line 60) unconditionally clears the playhead. Arguably correct (a toggle is always a direction change) but worth a second look.
- `setPatternId` (line 61) clears the playhead too. `Playback._invalidateCache` explicitly says the visual playhead should persist until the next tick — so the store may be fighting the class's design. Separate question.

### 🟠 Duplications

#### ~~L3. Two parallel `(mode, type)` validators~~ ✅ Fixed
**Where:** `lib/src/lib/url-state.ts:41-46` (`isValidTypeForMode`) and `lib/src/store/useFretworkStore.ts:131-136` (`isValidTypeFor`)
**Problem:** Same rule implemented twice with independent `SCALE_IDS`/`ARP_IDS` sets. Drift risk.
**Fix:** Exported `isValidTypeForMode` from `url-state.ts`; imported it in `useFretworkStore.ts`; deleted the duplicate function, its locals (`SCALE_IDS`/`ARP_IDS`/`NOTE_NAMES`), and the now-unused `SCALES`/`ARPEGGIOS`/`CHROMATIC_KEYS` imports from the store.

#### ~~L4. Cell-equality check inlined ≥3 times~~ ✅ Fixed
**Where:** Final count was 8 sites: `Playback.ts:155`, `usePlaybackStore.ts:66`, `usePlayback.ts:290`, `Fretboard.tsx` (3 sites), `up-and-down.ts:62`, `caged.ts:334`.
**Fix:** Added `cellsEqual(a, b)` helper in `lib/src/playback/types.ts` (structurally typed so it works for both `PlayableCell` and `AbsoluteCell`); replaced all 8 inlined call sites.

#### ~~L5. Playhead-reset duplicated~~ ✅ Fixed
**Where:** `lib/src/playback/Playback.ts` (stop handler and `setEnabled(false)`)
**Fix:** Extracted `_resetPlayhead()` private method; both call sites now invoke it.

#### ~~L6. CAGED resolver reimplements `buildUpAndDown`~~ ✅ Fixed
**Where:** `lib/src/playback/patterns/caged.ts` vs. `lib/src/playback/patterns/up-and-down.ts:buildUpAndDown`
**Fix:** Generalized `buildUpAndDown` in `up-and-down.ts` to a structural generic `<T extends { stringIndex: number; fret: number }>`; deleted the 40-line duplicate in `caged.ts` and imported the shared helper. Dropped now-unused `cellsEqual` and `PlayableCell` imports from `caged.ts`.

#### ~~L7. Select control boilerplate~~ ✅ Fixed
**Where:** `lib/src/components/controls/{Instrument,Key,Mode,Type,Tuning,Capo,Labels,Shape}Select.tsx`
**Fix:** Added `SelectControl.tsx` wrapper around `ControlGroup + Select` with built-in mono/uppercase styling on both the trigger and every item. Replaced all 8 callers — they now derive a `{value, label}[]` options array and pass it in. Trigger width overrides (`min-w-[140px]`, `w-[170px]`) come through a `triggerClassName?` escape hatch. Net ~125 lines removed; conditional rendering, sentinel-value translation, and number↔string coercion stay in callers where they belong.

### 🟡 Type-safety / API hygiene

#### ~~L8. `as CagedShapeId` / `as never` casts hide invalid IDs~~ ✅ Fixed
**Where:** `lib/src/components/fretboard/Fretboard.tsx`, `lib/src/playback/usePlayback.ts`
**Fix:** Added `isCagedShapeId(s: string | null | undefined): s is CagedShapeId` in `caged-shapes-data.ts` (also tightened `CAGED_PATTERN_IDS` to `readonly CagedShapeId[]`). Replaced both casts with guard calls; `resolveShapeAbsoluteCells` now receives a properly-narrowed `CagedShapeId`. Also re-exported the guard from `caged.ts`.

#### L9. `handler as never` in event-map registration — _skipped (low-priority)_
**Where:** `lib/src/metronome/Metronome.ts:111` (constructor's `events` option iteration)
**Problem:** Mismatched handler signatures aren't caught at compile time.
**Decision:** Reviewed three fixes (localized cast, switch block, unrolled per-event); all uglier than the current state for the value gained. The `events` constructor option is used in exactly one test and never in production. Leaving as-is.

#### ~~L10. Dead store setters on `useMetronomeStore`~~ ✅ Fixed
**Where:** `lib/src/metronome/useMetronomeStore.ts` — `setRunning`, `setCurrentBeat`, `setCurrentMeasure`, `setCurrentSubdivisionIndex`
**Fix:** Confirmed via grep that none of the four had any call sites outside the store file itself; the metronome singleton writes runtime fields via `useMetronomeStore.setState({...})` directly. Deleted all four from the interface and implementation; left a comment explaining why those fields are written via `setState` instead of through setters (they're mirrors of the Metronome class's state, not user-input contracts).

#### L11. Misleading deprecated exports — _skipped_
**Where:** `lib/src/lib/fretboard.ts:24-38` — `STRING_COUNT = 6`, `FRET_COUNT = 22`
**Problem:** Marked `@deprecated`, but still exported and still hard-coded to guitar values. `FRET_COUNT` is genuinely used as a bound in `playback/patterns/custom.ts:25` — wrong for bass (21 frets) / ukulele (15 frets).
**Audit results:** `STRING_COUNT` has zero usages outside its export + barrel. `FRET_COUNT` is used in `custom.ts` (real bug) + 4 test files (fixture constant). Deferred.

#### L12. `CHROMATIC_NOTES = CHROMATIC_KEYS` alias — _skipped (kept intentionally)_
**Where:** `lib/src/lib/tunings.ts:48-49`
**Audit:** `CHROMATIC_NOTES` has zero internal callers; `CHROMATIC_KEYS` has 4 (`url-state.ts`, `KeySelect.tsx`, `TypeSelect.tsx`).
**Decision:** Kept — there may have been or will be a use for the `CHROMATIC_NOTES` name to distinguish the Notes-mode usage from the key dropdown.

#### L13. `void TUNING_IDS` dead reference — _deferred_
**Where:** `lib/src/lib/url-state.ts:101-103`
**Problem:** The `void` is the only thing keeping the const alive — leftover from a previous export shape.
**Fix:** Delete `TUNING_IDS` if nothing depends on it. If it's needed for external consumers, export it properly and drop the `void`.

---

## `example/` audit

TODO.
