# Sound Lab Variants + Folder Picker + Catalog — Design

**Status:** Approved — ready for plan
**Date:** 2026-05-17
**Scope:** F.2 in `docs/supabase-integration.md`. Replaces the single-override-per-slot model with named, foldered variants. Introduces a shared library picker component, a per-instrument voice picker mounted across Practice/Patterns/Sound Lab, and a simple catalog page that validates the unified folder model.

---

## 1. Goals and non-goals

**Goals:**
- Let the user save multiple named voice tunings ("variants") per `(instrumentId, family)` slot.
- Make the shipped tunings ("defaults") immutable; all edits land on user variants.
- Organize variants into folders that share the same `collections` taxonomy as patterns and compositions.
- Pick the active variant from a single shared picker mounted on Practice, Patterns, and Sound Lab — removing the existing acoustic/electric family toggle.
- Build a minimal catalog page that surfaces the user's whole library across kinds, to validate the unified folder model.
- Extract a reusable `<LibraryPickerPanel>` component so patterns / compositions / voices pickers share one implementation.

**Non-goals (deferred):**
- Browsing other users' public content in the catalog page (this milestone is personal-library only).
- Drag-and-drop reorganization in any picker.
- Sharing/access-codes for folders (Group H deferred items).
- Composition viewer / voice-preset viewer share-route pages.
- Backwards-compatibility for the F.1 storage shape — no users exist yet, so the v1 shape is discarded silently.

---

## 2. Conceptual model

### Slot

A `Slot` is the pair `(instrumentId, family)` that playback resolves against. Slots are fixed; users cannot create or rename them.

| Instrument | Slots |
|------------|-------|
| guitar     | `acoustic-guitar`, `electric-guitar` |
| bass       | `acoustic-bass`, `electric-bass` |
| ukulele    | `acoustic-ukulele` |

(5 slots total — no ukulele-electric, matching the existing `VOICE_PRESETS` array.)

### Variant

A `Variant` is a tunable `VoicePreset` that belongs to a slot. Two kinds:

- **Default variant** — code constant, one per slot, immutable. Lives in `lib/src/playback/voices/presets.ts` as it does today. Never written to the DB or sessionStorage.
- **User variant** — created by the user. Has a uuid, a user-supplied name, an optional `collectionId` for folder placement, and a full `VoicePreset` payload. Stored in `voice_presets` (cloud, signed-in) or sessionStorage (anon).

### Active variant per instrument

`user_settings.active_variants` is a map keyed by `instrumentId` and valued by a `VariantRef`:

```ts
type VariantRef =
  | { kind: 'default'; slotId: SlotId }
  | { kind: 'user'; id: string };

interface ActiveVariantsMap {
  guitar: VariantRef;
  bass: VariantRef;
  ukulele: VariantRef;
}
```

Selecting a variant in the picker implicitly sets that instrument's family (the slot determines the family) — so removing the acoustic/electric toggle is consistent with the data model.

### Resolution

`resolveActiveVoice(instrumentId)` in `lib/src/playback/voices/preset-overrides.ts`:

1. Read `active_variants[instrumentId]` from the override blob (anon) or store-mirrored cloud state (signed-in).
2. If the ref is `{kind:'default', slotId}`, return the matching entry from `VOICE_PRESETS`.
3. If the ref is `{kind:'user', id}`, return the variant's `preset` from the variant store.
4. On any miss (missing ref, missing variant id, etc.), fall back to **the instrument's first default** (the acoustic variant for guitar / bass / ukulele).

Replaces today's `findEffectivePreset(instrumentId, family)`. The old API is removed; `usePlayback.ts` and `buildEffectiveVoice.ts` call the new resolver.

---

## 3. Storage

### Anon (sessionStorage)

Storage key stays `fretwork:lab-presets:v1`. Bumped to schema v2:

```json
{
  "schemaVersion": 2,
  "variants": [
    {
      "id": "uuid",
      "name": "My warm fingerstyle",
      "instrumentId": "guitar",
      "family": "acoustic",
      "collectionId": null,
      "preset": { /* full VoicePreset */ }
    }
  ],
  "activeVariants": {
    "guitar":   { "kind": "user",    "id": "uuid" },
    "bass":     { "kind": "default", "slotId": "acoustic-bass" },
    "ukulele":  { "kind": "default", "slotId": "acoustic-ukulele" }
  },
  "reverb": null
}
```

Anything with `schemaVersion !== 2` returns an empty record on read; defaults take over. No migration shim.

### Cloud (signed-in)

- **`voice_presets` table** — user variants only. `name` becomes the variant's user-facing name. `instrument_id` + `family` still pin the slot. `collection_id` (already a column) holds the folder placement. `data` holds the full `VoicePreset` JSON.
- **`user_settings.active_variants`** — repurposed `active_presets` jsonb column (rename in code; column name stays `active_presets` to avoid an unnecessary migration). Stores the `ActiveVariantsMap`.
- **Hydration on sign-in:** pull `voice_presets` rows + `user_settings.active_presets`. Resolve each ref against the loaded variants — if a `{kind:'user', id}` ref points to a missing row, replace it with the instrument's first default.

### Sync triggers

Auto-save / debounce is removed. Cloud writes fire on explicit user actions only:

| Action | Cloud effect |
|--------|--------------|
| Save (existing variant) | `UPDATE voice_presets WHERE id = ?` |
| Save as new variant | `INSERT INTO voice_presets`; then update `active_variants` if the new variant is selected |
| Rename variant | `UPDATE voice_presets SET name = ? WHERE id = ?` |
| Move variant to folder | `UPDATE voice_presets SET collection_id = ? WHERE id = ?` |
| Delete variant | `DELETE FROM voice_presets WHERE id = ?`; if it was the active one, set the active ref to the instrument's first default and upsert `user_settings` |
| Pick a variant in the picker | upsert `user_settings.active_presets` |
| Reverb edit (Sound Lab) | upsert `user_settings.reverb` on Save |

### Sign-out teardown

Existing F.1 teardown clears the override blob and the `voice_presets` row-id cache. Extend to also reset `activeVariants` to all-defaults so the next signed-out session is clean.

---

## 4. UI components

### 4.1 `<LibraryPickerPanel>` (shared, extracted)

**Location:** `example/src/library/LibraryPickerPanel.tsx`

A generic picker panel over any item type with `{ id, name, collectionId }`. Replaces today's `PatternPickerPanel` internal tree logic.

**Responsibilities (caller-agnostic):**
- Breadcrumb across folder hierarchy with click-to-jump.
- Filter input narrowing both folders and items.
- Folder rendering (current depth's subfolders).
- Item rendering (current depth's items).
- "+ New folder" inline input.
- "+ New item" button (delegated to caller).
- Row actions on folders + items (rename, move, delete) via context menu / kebab.
- Empty-folder hide/show toggle.
- Optional **pinned section** rendered above the foldered tree (used by the voice picker to surface defaults).

**Props (sketch):**

```ts
interface LibraryItem {
  id: string;
  name: string;
  collectionId: string | null;
}

interface LibraryPickerPanelProps<T extends LibraryItem> {
  items: T[];
  collections: Collection[];
  activeId?: string | null;
  initialFolderId?: string | null;

  pinnedSection?: React.ReactNode;
  renderItemRow: (item: T, ctx: { isActive: boolean }) => React.ReactNode;
  itemLabel: string; // 'voice' | 'pattern' | 'composition'
  filterPlaceholder?: string;
  newItemLabel?: string;

  onPickItem: (item: T) => void;
  onCreateItem: (folderId: string | null) => void;
  onRenameItem?: (id: string, newName: string) => void;
  onDeleteItem?: (id: string) => void;
  onMoveItem?: (id: string, folderId: string | null) => void;

  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder?: (id: string, newName: string) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void;
  onDeleteFolder?: (id: string) => void;
}
```

**Folder helpers** extracted to `example/src/library/folder-helpers.ts`: `buildBreadcrumb`, `subfoldersOf`, `itemsInFolder`, `countItemsInFolderTree`. Pure functions, no React.

### 4.2 `<VoicePickerChip>` / `<VoicePickerPanel>`

**Location:** `example/src/voices/VoicePickerChip.tsx`, `VoicePickerPanel.tsx`

- `<VoicePickerChip>` — compact button showing the active variant name. Clicking opens the popover (existing `SimplePopover`).
- `<VoicePickerPanel>` — wraps `LibraryPickerPanel`. The `pinnedSection` renders the current instrument's defaults (e.g. for guitar: "Acoustic Guitar" + "Electric Guitar"). Defaults aren't selectable for rename/delete. A horizontal separator separates pinned defaults from foldered user variants.

**Items shown:** user variants matching `currentInstrumentId` (both families intermingled — name carries the meaning).

**"+ New variant" and row actions are exposed only inside the Sound Lab variant picker.** On Practice and Patterns, the picker is read-only with respect to the variant set — you can pick which variant is active for the current instrument, but creating, renaming, moving, and deleting variants are lab-only operations. This keeps Practice/Patterns focused on playing and the lab focused on tuning, and avoids surfacing potentially destructive actions outside the editing context.

**Sound Lab picker actions:**
- **"+ New variant"** — opens save-as modal seeded with the current lab edits (or the active variant's preset, if no edits are pending). User supplies a name and an optional folder; new variant becomes active.
- **Rename** (inline input on the row).
- **Move to folder** (submenu showing the folder tree).
- **Delete** (confirm dialog reusing the existing pattern delete dialog primitive). If the deleted variant was active for its instrument, the active ref falls back to the instrument's first default per Section 2's resolution rule.

**Folder actions** (Sound Lab picker only): rename / move / delete on user folders. Default variants are pinned outside the folder tree, so folder operations never affect them. Deleting a folder containing variants warns "This folder contains N voices (and may also contain patterns / compositions). Delete anyway?" — the warning counts across kinds so the user understands shared-folder consequences.

### 4.3 Mount points

- **Practice page (TopBar):** `<VoicePickerChip>` **replaces** the acoustic/electric family toggle. The chip is the sole voice control.
- **Patterns page top controls bar:** add `<VoicePickerChip>` next to the existing pattern picker chip.
- **Sound Lab header:** `<VoicePickerChip>` replaces today's `<select value={activeId}>` preset dropdown.

### 4.4 Sound Lab edit overhaul

- All slider edits are ephemeral until commit. The lab keeps a local `pendingPreset` state; sessionStorage / cloud are not touched on slider change.
- **Save** button — overwrites the current variant. Disabled when active variant is a default.
- **Save as new variant…** — always enabled. Opens a modal with name input (default: `"{sourceName} — copy"`) and folder selector (default: current breadcrumb or the source's folder).
- **Dirty-state pill** in the header (unchanged from today, repurposed): `idle` / `unsaved` / `saved`.
- **Dirty-state confirm dialogs** trigger when:
  - User picks a different variant in the picker while dirty.
  - User navigates away from the Sound Lab while dirty (router-level guard + `beforeunload`).
- **Banner under picker** when active variant is a default: *"Defaults are read-only. Use Save as new variant to keep your tweaks."*
- **Removed buttons:** `Reset preset`, `Reset all`. Defaults are inherently immutable, so reset is meaningless; user-variant equivalents are achieved by delete.
- **Import / Export** kept. Import shape carries a single variant rather than a slot-keyed map; importing creates a new user variant in the active instrument's slot.
- Reverb editor stays as a global section, still gated by an explicit Save (no auto-sync).

### 4.5 Catalog page

**Route:** `?page=catalog` (mirrors `?page=patterns`). Routed in `example/src/main.tsx`.

**Purpose for this milestone:** validate the unified folder UX with mixed-kind content. Not a public discovery surface.

**Layout:**
- Header with title + filter row: **Search**, **Kind** (All / Voices / Patterns / Compositions), **Instrument** (All / Guitar / Bass / Ukulele).
- Folder tree rendered as a hierarchical list. Each folder row shows a folder-filtered count (e.g. "Rock (3)" reflects current Kind/Instrument filter, not raw size).
- Items render with a kind icon, kind label, instrument badge, and an "open" action.
  - Voice open → Sound Lab (`?lab=1`) with that variant loaded and made active.
  - Pattern open → Patterns page with that pattern active.
  - Composition open → Patterns page composition mode (existing affordance).
- Empty folders under the current filters are hidden by default; "Show empty folders" toggle reveals them for re-org.
- Item / folder row actions (rename, move, delete) available via kebab — reuses the same callbacks as the kind-specific pickers (they all hit the same store actions).

**Reuses:** `folder-helpers.ts` selectors. Does **not** reuse `LibraryPickerPanel` itself — the catalog's mixed-kind layout + top filter row don't fit cleanly into the picker shape; logic is shared, presentation is not.

---

## 5. Store + library changes

### 5.1 New types (in `lib/src/playback/voices/`)

```ts
export type SlotId =
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'acoustic-bass'
  | 'electric-bass'
  | 'acoustic-ukulele';

export interface Variant {
  id: string;
  name: string;
  instrumentId: FretInstrumentId;
  family: VoiceFamily;
  collectionId: string | null;
  preset: VoicePreset;
}

export type VariantRef =
  | { kind: 'default'; slotId: SlotId }
  | { kind: 'user'; id: string };

export interface ActiveVariantsMap {
  guitar: VariantRef;
  bass: VariantRef;
  ukulele: VariantRef;
}
```

### 5.2 New / changed APIs

**`lib/src/playback/voices/preset-overrides.ts`** (renamed conceptually; storage shape v2):

- New: `resolveActiveVoice(instrumentId): VoicePreset`
- New: `getActiveVariantRef(instrumentId): VariantRef`
- New: `setActiveVariantRef(instrumentId, ref): void`
- New: `listVariantsForInstrument(instrumentId): Variant[]`
- New: `addVariant(variant): void`
- New: `updateVariant(id, patch): void`
- New: `renameVariant(id, name): void`
- New: `setVariantCollection(id, collectionId): void`
- New: `deleteVariant(id): void`
- Kept: `getEffectiveReverb()`, `setReverbOverride()` (no functional change beyond Save gating).
- Removed: `findEffectivePreset`, `getEffectivePreset`, `setPresetOverride`, `clearPresetOverride`, `clearAllOverrides`, `getPresetSource`.

**`lib/src/cloud/sync.ts`** — rewrite `hydrateLabFromCloud` and `performLabSync` against the new shape. Drop the debounce timer for the lab path.

**Default helpers:**
- `getDefaultVariantsForInstrument(instrumentId): { slotId: SlotId; preset: VoicePreset }[]`
- `getInstrumentFirstDefault(instrumentId): SlotId` — used by the fallback chain.

### 5.3 Patterns store

No schema changes to `usePatternsStore`. Collection actions stay as-is; the voice picker shells out to them through props.

If we want centralized variant state in a store (rather than module-level cache), spin up `useVoiceStore` in `lib/src/playback/voices/useVoiceStore.ts` — a Zustand store mirroring the override blob in memory and providing selectors. Reactive subscriptions are simpler than today's custom-event bus. **Decision: ship `useVoiceStore`.** Keeps consistency with patterns / metronome / playback / auth stores.

---

## 6. Implementation order

Each chunk is independently mergeable and demoable.

### Chunk 1 — Data model + resolution (no UI)
- Add `Variant`, `VariantRef`, `ActiveVariantsMap`, `SlotId`.
- Build `useVoiceStore` (Zustand) backed by sessionStorage v2.
- Implement `resolveActiveVoice` + helpers.
- Rewrite `hydrateLabFromCloud` / `performLabSync` for the new shape (variants table + `user_settings.active_presets` jsonb).
- Update `usePlayback.ts` and `buildEffectiveVoice.ts` to call the new resolver.
- Delete obsolete F.1 APIs.
- Unit tests: resolution chain, fallback behavior, sessionStorage v2 read/write.

### Chunk 2 — `LibraryPickerPanel` extraction
- Extract `<LibraryPickerPanel>` + `folder-helpers.ts`.
- Refactor `PatternPickerPanel` to wrap it.
- Split `CompositionPickerPanel` out of the polymorphic original (each becomes a thin wrapper).
- Snapshot-verify patterns + compositions pickers function identically.

### Chunk 3 — `VoicePicker` in Sound Lab
- Build `<VoicePickerChip>` + `<VoicePickerPanel>`.
- Implement "Save as new variant" modal.
- Wire row actions (rename, move, delete) to `useVoiceStore` actions.
- Mount in Sound Lab, replacing today's preset dropdown.

### Chunk 4 — Sound Lab edit-behavior overhaul
- Local `pendingPreset` state, ephemeral until commit.
- Two save buttons (Save / Save as new variant…). Disable Save on default.
- Dirty-state confirm dialogs on variant switch and route navigation.
- Add "Defaults are read-only" banner.
- Remove `Reset preset` / `Reset all` and the debounced sync path.
- Update Import/Export to operate on single-variant payloads.

### Chunk 5 — Mount `<VoicePickerChip>` on Practice + Patterns
- Replace the acoustic/electric family toggle in the Practice TopBar with the chip.
- Add the chip to the Patterns page top controls bar.
- Verify Family/instrument selection still produces correct playback in both pages.

### Chunk 6 — Catalog page
- New route `?page=catalog`, wired in `main.tsx`.
- Header filter row (Search / Kind / Instrument).
- Folder-tree renderer over the shared `collections` slice, kind-filtered with kind-aware counts.
- Row actions reuse the existing store callbacks.
- "Show empty folders" toggle.
- Per-kind "open" handlers (voice → Sound Lab; pattern → Patterns; composition → Patterns/composition mode).

### Chunk 7 — Verification + cleanup
- Cross-device sync: variant CRUD + active variant ref roundtrip.
- Anon flow: create / edit / save-as / rename / delete / sign up → migration of the active variant ref + variants.
- Sign-out teardown clears variants and active refs.
- Update `docs/supabase-integration.md` F.2 row to "Done."
- Delete any dead F.1 code paths discovered.

---

## 7. Risks and trade-offs

- **Removing the family toggle changes muscle memory.** Mitigated by the picker chip showing the active variant prominently and being one click + arrow-key navigable.
- **Picker mount in three places.** A bug surfaces three times. Mitigated by sharing the chip + panel components (no duplicated picker logic).
- **Shared folder tree across kinds.** A user filing a tone in "Country" expects to find it under Country in the lab picker — they will, because the picker filters to voices but uses the same folders. The "(N)" counts being kind-aware prevent confusion.
- **Catalog page is a stub.** Could create confusion about its purpose. Mitigated by clear header copy: "Your library — all kinds, all folders."
- **No backwards-compat shim for F.1 storage.** Safe because no users exist.

---

## 8. Open follow-ups (out of scope here, tracked for later)

- Composition viewer route (deferred from Group G).
- Voice-preset viewer route (deferred from Group G).
- Drag-and-drop in pickers and catalog.
- Folder visibility editing UI / shared-folder viewer route.
- Catalog discovery surface for other users' public content.
- Access codes / folder sharing.
- Subscription gating once Pro has tangible perks.
