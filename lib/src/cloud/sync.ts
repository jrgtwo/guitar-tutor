/**
 * Cloud sync for patterns + compositions.
 *
 * Strategy:
 *   - On sign-in: fetch all of the user's rows from Supabase and hydrate
 *     the patterns store. Take a "snapshot" of what we just loaded so future
 *     diffs work.
 *   - On every store mutation (after sign-in): diff current state vs the
 *     snapshot. Inserts go up as INSERT, updates as UPDATE, deletions as
 *     DELETE. Debounced 500ms so rapid edits coalesce.
 *   - Hydration writes set an `isHydrating` flag so the change subscriber
 *     skips uploads during the load — otherwise we'd try to upload what we
 *     just downloaded.
 *   - On sign-out: clear the in-memory store + sessionStorage so cloud
 *     content doesn't leak to a subsequent anon session in the same tab.
 *
 * Used via the `useCloudSync()` React hook — mount it once at the app root
 * (alongside `useAuth()`).
 */
import { useEffect } from 'react';
import { getSupabaseClient } from '../auth/supabaseClient';
import { useAuthStore } from '../auth/useAuthStore';
import { clearMigrationFlag } from '../auth/migration';
import {
  usePatternsStore,
  DEFAULT_PATTERNS_STATE,
} from '../patterns/store/usePatternsStore';
import type { Composition, Pattern } from '../patterns';
import {
  loadOverrides,
  saveOverrides,
  subscribeToOverrides,
  LAB_STORAGE_KEY,
  type PresetOverridesData,
} from '../playback/voices/preset-overrides';
import type { VoicePreset, ReverbSettings } from '../playback/voices/types';

// ─── Module-level sync state ──────────────────────────────────────────────

let isHydrating = false;
let lastPatternsSnapshot: Pattern[] = [];
let lastCompositionsSnapshot: Composition[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let storeUnsubscribe: (() => void) | null = null;
let currentUserId: string | null = null;

/** Lab-overrides sync state. Map from preset_id → DB row id so we can UPDATE
 *  in place instead of doing a SELECT-then-INSERT/UPDATE round trip on each
 *  save. Populated on hydration and updated on writes. */
let labRowIdByPresetId: Map<string, string> = new Map();
let lastReverbSnapshot: ReverbSettings | null = null;
let lastLabPresetsSnapshot: Record<string, VoicePreset> = {};
let labUnsubscribe: (() => void) | null = null;
let labDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 500;
const SESSION_STORAGE_KEY = 'fretwork:patterns:v1';

// ─── Public hook ──────────────────────────────────────────────────────────

/**
 * useCloudSync — mount once at the app root.
 *
 * Watches `useAuthStore.user` and activates / deactivates the sync subscription
 * accordingly. Idempotent: re-mounting doesn't double-subscribe.
 *
 * Hydration is deferred while migration is pending — otherwise we'd race the
 * MigrationPromptDialog: cloud sync would fetch empty cloud and overwrite the
 * sessionStorage that the migration was about to upload from. We hold back
 * until `migrationResolved` flips true (set by MigrationPromptDialog on Add/Discard).
 */
export function useCloudSync(): void {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const migrationResolved = useAuthStore((s) => s.migrationResolved);

  useEffect(() => {
    // Only sync once the user is fully signed in (profile loaded). 'needs-profile'
    // means we're authenticated but haven't created our profile row yet.
    if (status !== 'signed-in' || !user) {
      if (currentUserId) {
        teardownSync();
      }
      return;
    }
    if (currentUserId === user.id) {
      // Already syncing for this user.
      return;
    }

    // Defer hydration if there's anon session content waiting to be migrated.
    // We wait for `migrationResolved` to flip (set by the migration prompt)
    // before fetching cloud data, otherwise hydration clobbers the
    // pre-migration sessionStorage content.
    const hasPendingMigration = pendingMigrationContent() && !migrationResolved;
    if (hasPendingMigration) return;

    if (currentUserId) teardownSync();
    void initializeSync(user.id);
  }, [user, status, migrationResolved]);
}

/** Quick check: is there anon-authored content in sessionStorage that hasn't
 *  been migrated yet? Used to decide whether to defer cloud hydration. */
function pendingMigrationContent(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const patternsRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (patternsRaw) {
      const parsed = JSON.parse(patternsRaw) as { state?: { library?: { patterns?: unknown[]; compositions?: unknown[] } } };
      const lib = parsed?.state?.library;
      if ((lib?.patterns?.length ?? 0) > 0 || (lib?.compositions?.length ?? 0) > 0) return true;
    }
    const labRaw = sessionStorage.getItem(LAB_STORAGE_KEY);
    if (labRaw) {
      const parsed = JSON.parse(labRaw) as { presets?: Record<string, unknown>; reverb?: unknown };
      if (Object.keys(parsed?.presets ?? {}).length > 0) return true;
      if (parsed?.reverb) return true;
    }
  } catch {
    // ignore — treat as no pending content
  }
  return false;
}

// ─── Internal: initialization & teardown ──────────────────────────────────

async function initializeSync(userId: string): Promise<void> {
  currentUserId = userId;
  await Promise.all([hydrateFromCloud(userId), hydrateLabFromCloud(userId)]);
  installStoreSubscription();
  installLabSubscription();
}

function teardownSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (labDebounceTimer) {
    clearTimeout(labDebounceTimer);
    labDebounceTimer = null;
  }
  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }
  if (labUnsubscribe) {
    labUnsubscribe();
    labUnsubscribe = null;
  }
  currentUserId = null;
  lastPatternsSnapshot = [];
  lastCompositionsSnapshot = [];
  labRowIdByPresetId = new Map();
  lastReverbSnapshot = null;
  lastLabPresetsSnapshot = {};

  // Clear in-memory state and sessionStorage so cloud content doesn't leak
  // to a subsequent anon session in the same tab.
  usePatternsStore.setState({ ...DEFAULT_PATTERNS_STATE });
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(LAB_STORAGE_KEY);
  } catch {
    // private-browsing or quota issues — non-fatal.
  }
  // Reset the in-memory lab cache too via the saveOverrides path so its
  // subscribers see the cleared state.
  saveOverrides({ schemaVersion: 1, presets: {} });
  // Also clear the migration-done flag so a subsequent anon → signup flow
  // in the same tab can re-trigger the prompt for its own session content.
  clearMigrationFlag();
}

// ─── Hydration: cloud → store ─────────────────────────────────────────────

async function hydrateFromCloud(userId: string): Promise<void> {
  isHydrating = true;
  try {
    const client = getSupabaseClient();

    const [patternsResult, compositionsResult] = await Promise.all([
      client
        .from('patterns')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      client
        .from('compositions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
    ]);

    const patterns: Pattern[] = (patternsResult.data ?? []).map((row) => {
      const data = row.data as Pattern;
      // Override the Pattern's id with the DB row id. This handles migrated
      // anon content where the Pattern.id inside data is still the old
      // `pat_xxx` format — we need it to match the DB row UUID for syncs.
      return { ...data, id: row.id as string };
    });

    const compositions: Composition[] = (compositionsResult.data ?? []).map((row) => {
      const data = row.data as Composition;
      return { ...data, id: row.id as string };
    });

    usePatternsStore.setState({
      library: { patterns, compositions },
    });

    lastPatternsSnapshot = patterns;
    lastCompositionsSnapshot = compositions;

    if (patternsResult.error) {
      console.error('[cloud sync] fetch patterns error:', patternsResult.error);
    }
    if (compositionsResult.error) {
      console.error('[cloud sync] fetch compositions error:', compositionsResult.error);
    }
  } catch (e) {
    console.error('[cloud sync] hydrateFromCloud threw:', e);
  } finally {
    isHydrating = false;
  }
}

// ─── Store subscription: store mutations → cloud writes ───────────────────

function installStoreSubscription(): void {
  if (storeUnsubscribe) return;
  storeUnsubscribe = usePatternsStore.subscribe((state) => {
    if (isHydrating) return;
    if (!currentUserId) return;
    scheduleSync(state.library.patterns, state.library.compositions);
  });
}

function scheduleSync(patterns: Pattern[], compositions: Composition[]): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void performSync(patterns, compositions);
  }, DEBOUNCE_MS);
}

async function performSync(patterns: Pattern[], compositions: Composition[]): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;

  try {
    await Promise.all([
      syncCollection('patterns', userId, patterns, lastPatternsSnapshot, (next) => {
        lastPatternsSnapshot = next;
      }),
      syncCollection('compositions', userId, compositions, lastCompositionsSnapshot, (next) => {
        lastCompositionsSnapshot = next;
      }),
    ]);
  } catch (e) {
    console.error('[cloud sync] performSync threw:', e);
  }
}

/**
 * Generic diff-and-sync for one collection. Works for `patterns` and
 * `compositions` because they share the same shape (`id`, `name`, `data`,
 * `updatedAt`, owned by user).
 *
 * Diff logic:
 *   - present in current, missing in snapshot → INSERT
 *   - present in both, updatedAt differs       → UPDATE
 *   - present in snapshot, missing in current  → DELETE
 *
 * On any failure, we DON'T update the snapshot — the failed delta will be
 * retried on the next mutation. This is intentionally simple at the cost of
 * eventually consistent only.
 */
async function syncCollection<T extends { id: string; name: string; updatedAt: number }>(
  table: 'patterns' | 'compositions',
  userId: string,
  current: T[],
  snapshot: T[],
  updateSnapshot: (next: T[]) => void,
): Promise<void> {
  const client = getSupabaseClient();
  const currentById = new Map(current.map((p) => [p.id, p]));
  const snapshotById = new Map(snapshot.map((p) => [p.id, p]));

  const inserts: T[] = [];
  const updates: T[] = [];
  const deletes: string[] = [];

  for (const item of current) {
    const prev = snapshotById.get(item.id);
    if (!prev) inserts.push(item);
    else if (prev.updatedAt !== item.updatedAt) updates.push(item);
  }
  for (const id of snapshotById.keys()) {
    if (!currentById.has(id)) deletes.push(id);
  }

  let ok = true;

  if (inserts.length > 0) {
    const rows = inserts.map((item) => ({
      id: item.id,
      user_id: userId,
      name: item.name,
      data: item,
      visibility: 'private' as const,
    }));
    const { error } = await client.from(table).insert(rows);
    if (error) {
      console.error(`[cloud sync] ${table} INSERT failed:`, error);
      ok = false;
    }
  }

  if (updates.length > 0) {
    // Sequential to keep the per-row error surface clean; volumes are small.
    for (const item of updates) {
      const { error } = await client
        .from(table)
        .update({ name: item.name, data: item })
        .eq('id', item.id);
      if (error) {
        console.error(`[cloud sync] ${table} UPDATE failed for ${item.id}:`, error);
        ok = false;
      }
    }
  }

  if (deletes.length > 0) {
    const { error } = await client.from(table).delete().in('id', deletes);
    if (error) {
      console.error(`[cloud sync] ${table} DELETE failed:`, error);
      ok = false;
    }
  }

  if (ok) {
    updateSnapshot(current);
  }
}

// ─── Lab overrides cloud sync (Sound Lab) ─────────────────────────────────

/** Pull the user's voice_presets rows + user_settings.reverb from the cloud
 *  and write them into the local sessionStorage-backed override blob. */
async function hydrateLabFromCloud(userId: string): Promise<void> {
  isHydrating = true;
  try {
    const client = getSupabaseClient();

    const [presetsResult, settingsResult] = await Promise.all([
      client.from('voice_presets').select('*').eq('user_id', userId),
      client.from('user_settings').select('reverb').eq('user_id', userId).maybeSingle(),
    ]);

    const presets: Record<string, VoicePreset> = {};
    const rowIdMap = new Map<string, string>();
    for (const row of presetsResult.data ?? []) {
      const data = row.data as VoicePreset;
      // In F.1 we use `name` to store the preset_id, so the row maps 1:1 to
      // an entry in PresetOverridesData.presets. F.2 will introduce multiple
      // variants per preset_id; we'll change this lookup then.
      const presetId = (row.name as string) ?? data.id;
      presets[presetId] = data;
      rowIdMap.set(presetId, row.id as string);
    }
    labRowIdByPresetId = rowIdMap;

    const reverb = (settingsResult.data?.reverb as ReverbSettings | null) ?? undefined;

    const overrides: PresetOverridesData = {
      schemaVersion: 1,
      presets,
      reverb,
    };
    saveOverrides(overrides);
    lastLabPresetsSnapshot = { ...presets };
    lastReverbSnapshot = reverb ?? null;

    if (presetsResult.error) {
      console.error('[cloud sync] fetch voice_presets error:', presetsResult.error);
    }
    if (settingsResult.error) {
      console.error('[cloud sync] fetch user_settings error:', settingsResult.error);
    }
  } catch (e) {
    console.error('[cloud sync] hydrateLabFromCloud threw:', e);
  } finally {
    isHydrating = false;
  }
}

function installLabSubscription(): void {
  if (labUnsubscribe) return;
  labUnsubscribe = subscribeToOverrides(() => {
    if (isHydrating) return;
    if (!currentUserId) return;
    if (labDebounceTimer) clearTimeout(labDebounceTimer);
    labDebounceTimer = setTimeout(() => {
      labDebounceTimer = null;
      void performLabSync();
    }, DEBOUNCE_MS);
  });
}

async function performLabSync(): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;

  try {
    const client = getSupabaseClient();
    const current = loadOverrides();

    // Determine changes against the snapshot.
    const currentIds = new Set(Object.keys(current.presets));
    const prevIds = new Set(Object.keys(lastLabPresetsSnapshot));

    const inserts: VoicePreset[] = [];
    const updates: Array<{ rowId: string; preset: VoicePreset }> = [];
    const deletes: string[] = [];

    for (const id of currentIds) {
      const cur = current.presets[id];
      const prev = lastLabPresetsSnapshot[id];
      if (!prev) {
        inserts.push(cur);
      } else if (JSON.stringify(prev) !== JSON.stringify(cur)) {
        const rowId = labRowIdByPresetId.get(id);
        if (rowId) updates.push({ rowId, preset: cur });
        else inserts.push(cur);
      }
    }
    for (const id of prevIds) {
      if (!currentIds.has(id)) {
        const rowId = labRowIdByPresetId.get(id);
        if (rowId) deletes.push(rowId);
      }
    }

    if (inserts.length > 0) {
      const rows = inserts.map((p) => ({
        user_id: userId,
        name: p.id,
        instrument_id: p.instrumentId,
        family: p.family,
        data: p,
        visibility: 'private' as const,
      }));
      const { data, error } = await client.from('voice_presets').insert(rows).select('id, name');
      if (error) {
        console.error('[cloud sync] voice_presets INSERT failed:', error);
      } else if (data) {
        for (const row of data) {
          labRowIdByPresetId.set(row.name as string, row.id as string);
        }
      }
    }

    for (const { rowId, preset } of updates) {
      const { error } = await client
        .from('voice_presets')
        .update({
          name: preset.id,
          instrument_id: preset.instrumentId,
          family: preset.family,
          data: preset,
        })
        .eq('id', rowId);
      if (error) {
        console.error(`[cloud sync] voice_presets UPDATE failed for ${rowId}:`, error);
      }
    }

    if (deletes.length > 0) {
      const { error } = await client.from('voice_presets').delete().in('id', deletes);
      if (error) {
        console.error('[cloud sync] voice_presets DELETE failed:', error);
      } else {
        // Remove from local row-id map too.
        for (const [presetId, rowId] of labRowIdByPresetId) {
          if (deletes.includes(rowId)) labRowIdByPresetId.delete(presetId);
        }
      }
    }

    // Reverb (user_settings singleton). Upsert by user_id PK.
    const currentReverb = current.reverb ?? null;
    if (JSON.stringify(currentReverb) !== JSON.stringify(lastReverbSnapshot)) {
      const { error } = await client.from('user_settings').upsert({
        user_id: userId,
        reverb: currentReverb,
      });
      if (error) {
        console.error('[cloud sync] user_settings.reverb upsert failed:', error);
      } else {
        lastReverbSnapshot = currentReverb;
      }
    }

    lastLabPresetsSnapshot = { ...current.presets };
  } catch (e) {
    console.error('[cloud sync] performLabSync threw:', e);
  }
}

/** Test-only escape hatch. */
export function _resetCloudSyncForTests(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (storeUnsubscribe) storeUnsubscribe();
  if (labDebounceTimer) clearTimeout(labDebounceTimer);
  if (labUnsubscribe) labUnsubscribe();
  isHydrating = false;
  lastPatternsSnapshot = [];
  lastCompositionsSnapshot = [];
  labRowIdByPresetId = new Map();
  lastReverbSnapshot = null;
  lastLabPresetsSnapshot = {};
  debounceTimer = null;
  labDebounceTimer = null;
  storeUnsubscribe = null;
  labUnsubscribe = null;
  currentUserId = null;
}
