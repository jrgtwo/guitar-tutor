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

#### L3. Two parallel `(mode, type)` validators
**Where:** `lib/src/lib/url-state.ts:41-46` (`isValidTypeForMode`) and `lib/src/store/useFretworkStore.ts:131-136` (`isValidTypeFor`)
**Problem:** Same rule implemented twice with independent `SCALE_IDS`/`ARP_IDS` sets. Drift risk.
**Fix:** Extract to a single helper in `lib/src/lib/validators.ts` (new) or `lib/src/lib/utils.ts`; both consumers import it.

#### L4. Cell-equality check inlined ≥3 times
**Where:** `lib/src/playback/Playback.ts:144`, `lib/src/playback/usePlaybackStore.ts:57`, `lib/src/playback/usePlayback.ts:289` (search for `stringIndex === ... && fret === ...`)
**Fix:** One `cellsEqual(a, b)` helper in `lib/src/playback/types.ts` or a small `lib/src/playback/cells.ts`.

#### L5. Playhead-reset duplicated
**Where:** `lib/src/playback/Playback.ts:73-74` (stop handler) and `lib/src/playback/Playback.ts:85-86` (setEnabled(false))
**Fix:** Extract `_resetPlayhead()` private method.

#### L6. CAGED resolver reimplements `buildUpAndDown`
**Where:** `lib/src/playback/patterns/caged.ts` (ascending+descending traversal) vs. `lib/src/playback/patterns/up-and-down.ts:buildUpAndDown`
**Fix:** Replace the CAGED-internal traversal with a call to `buildUpAndDown(cells)`.

#### L7. Select control boilerplate
**Where:** `lib/src/components/controls/{Instrument,Key,Mode,Type,Tuning,Capo,Labels,Shape}Select.tsx`
**Problem:** All follow the same `<ControlGroup label><Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{opts.map(...)}</SelectContent></Select>` shape. ~5-10 redundant lines per file.
**Fix:** Introduce a `<SelectControl label= options= value= onChange=/>` wrapper; call it from each.

### 🟡 Type-safety / API hygiene

#### L8. `as CagedShapeId` / `as never` casts hide invalid IDs
**Where:** `lib/src/components/fretboard/Fretboard.tsx:77`, `lib/src/playback/usePlayback.ts:223`
**Problem:** `shapeId` is `string | null`; the cast bypasses validation.
**Fix:** Add `isCagedShapeId(s: string): s is CagedShapeId` type guard alongside `CAGED_PATTERN_IDS`; replace both casts with calls to the guard.

#### L9. `handler as never` in event-map registration
**Where:** `lib/src/metronome/Metronome.ts:111` (constructor's `events` option iteration)
**Problem:** Mismatched handler signatures aren't caught at compile time.
**Fix:** Iterate with explicit type narrowing per event key, or hand-roll a small typed wrapper.

#### L10. Dead store setters on `useMetronomeStore`
**Where:** `lib/src/metronome/useMetronomeStore.ts:53-56` — `setRunning`, `setCurrentBeat`, `setCurrentMeasure`, `setCurrentSubdivisionIndex`
**Problem:** Exposed on the public interface but never called externally (singleton writes via `useMetronomeStore.setState({...})` directly). They appear in the type, expanding the API surface for no benefit.
**Fix:** Delete from the interface + implementation. The internal `setState` calls don't need them.

#### L11. Misleading deprecated exports
**Where:** `lib/src/lib/fretboard.ts:24-38` — `STRING_COUNT = 6`, `FRET_COUNT = 22`
**Problem:** Marked `@deprecated`, but still exported and still hard-coded to guitar values. Wrong for bass (4/21) and uke (4/15).
**Fix:** Audit internal callers; replace with per-instrument lookups; remove the exports if no external consumer needs them.

#### L12. `CHROMATIC_NOTES = CHROMATIC_KEYS` alias
**Where:** `lib/src/lib/tunings.ts:48-49`
**Problem:** Same array exported under two names. Consumers don't know which to use.
**Fix:** Pick one canonical name; remove the other (or keep one as a deprecation-tagged alias and migrate consumers).

#### L13. `void TUNING_IDS` dead reference
**Where:** `lib/src/lib/url-state.ts:101-103`
**Problem:** The `void` is the only thing keeping the const alive — leftover from a previous export shape.
**Fix:** Delete `TUNING_IDS` if nothing depends on it. If it's needed for external consumers, export it properly and drop the `void`.

---

## `example/` audit

TODO.
