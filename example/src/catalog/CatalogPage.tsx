/**
 * CatalogPage — `?page=catalog`.
 *
 * Personal-library browser across all kinds. Validates the unified folder model
 * with mixed-kind content. Top filter row scopes by kind + instrument; the
 * folder tree below reflects the shared `collections` taxonomy.
 *
 * What this is NOT (yet): a public discovery surface. It only shows the current
 * user's content (anon = whatever's in sessionStorage; signed-in = whatever the
 * cloud sync has hydrated).
 */
import { useMemo, useState } from 'react';
import { Folder } from 'lucide-react';
import {
  usePatternsStore,
  useVoiceStore,
  type FretInstrumentId,
} from '@fretwork/lib';

/** Coerce a loosely-typed `instrumentId: string` from the patterns/composition
 *  stores into the strict `FretInstrumentId` union. Anything outside the union
 *  shouldn't reach the catalog — defaulting to 'guitar' keeps the row visible
 *  rather than silently dropping it. */
function asFretInstrumentId(id: string): FretInstrumentId {
  return (id === 'bass' || id === 'ukulele' ? id : 'guitar') as FretInstrumentId;
}
import { Link } from '../router';
import { CatalogRow, type CatalogRowItem } from './CatalogRow';
import {
  buildBreadcrumb,
  subfoldersOf,
  itemsInFolder,
  buildFolderCounter,
} from '../library/folder-helpers';

type KindFilter = 'all' | 'voice' | 'pattern' | 'composition';
type InstrumentFilter = 'all' | FretInstrumentId;

export function CatalogPage() {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const variants = useVoiceStore((s) => s.variants);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentFilter>('all');
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Build the heterogeneous row list, applying kind + instrument + search filters.
  // Patterns: skip the auto-seeded draft (it shouldn't surface in the library).
  const rows: CatalogRowItem[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = (name: string) => !needle || name.toLowerCase().includes(needle);
    const matchesInstr = (inst: string) =>
      instrumentFilter === 'all' || instrumentFilter === inst;

    const out: CatalogRowItem[] = [];
    if (kindFilter === 'all' || kindFilter === 'voice') {
      for (const v of variants) {
        if (!matchesInstr(v.instrumentId)) continue;
        if (!matchesSearch(v.name)) continue;
        out.push({
          kind: 'voice',
          id: v.id,
          name: v.name,
          collectionId: v.collectionId,
          instrumentId: v.instrumentId,
        });
      }
    }
    if (kindFilter === 'all' || kindFilter === 'pattern') {
      for (const p of patterns) {
        if (p.id === draftId) continue;
        if (!matchesInstr(p.instrumentId)) continue;
        if (!matchesSearch(p.name)) continue;
        out.push({
          kind: 'pattern',
          id: p.id,
          name: p.name,
          collectionId: p.collectionId,
          instrumentId: asFretInstrumentId(p.instrumentId),
        });
      }
    }
    if (kindFilter === 'all' || kindFilter === 'composition') {
      for (const c of compositions) {
        if (!matchesInstr(c.instrumentId)) continue;
        if (!matchesSearch(c.name)) continue;
        out.push({
          kind: 'composition',
          id: c.id,
          name: c.name,
          collectionId: c.collectionId,
          instrumentId: asFretInstrumentId(c.instrumentId),
        });
      }
    }
    return out;
  }, [variants, patterns, compositions, draftId, kindFilter, instrumentFilter, search]);

  const collectionsById = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections],
  );
  const breadcrumb = useMemo(
    () => buildBreadcrumb(collectionsById, currentFolderId),
    [collectionsById, currentFolderId],
  );
  const subfolders = useMemo(
    () => subfoldersOf(collections, currentFolderId),
    [collections, currentFolderId],
  );
  const itemsHere = useMemo(
    () => itemsInFolder(rows, currentFolderId),
    [rows, currentFolderId],
  );

  // Folder counts under the current filters — used both to display "(N)" and
  // to decide which empty folders to hide. A folder's count walks its
  // descendants so a folder whose subfolder contains matching items still
  // shows up.
  const folderCount = useMemo(
    () => buildFolderCounter(collections, rows),
    [collections, rows],
  );

  const visibleFolders = showEmpty
    ? subfolders
    : subfolders.filter((f) => folderCount(f.id) > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-charcoal-raised/70 backdrop-blur px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">Catalog</h1>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Your library — all kinds, all folders
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to={{ kind: 'home' }}
            className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Filter row */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-9 px-3 text-sm rounded-md border border-input bg-background flex-1 min-w-[12rem]"
          />
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className="h-9 px-2 text-sm rounded-md border border-input bg-background"
            aria-label="Filter by kind"
          >
            <option value="all">All kinds</option>
            <option value="voice">Voices</option>
            <option value="pattern">Patterns</option>
            <option value="composition">Compositions</option>
          </select>
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value as InstrumentFilter)}
            className="h-9 px-2 text-sm rounded-md border border-input bg-background"
            aria-label="Filter by instrument"
          >
            <option value="all">All instruments</option>
            <option value="guitar">Guitar</option>
            <option value="bass">Bass</option>
            <option value="ukulele">Ukulele</option>
          </select>
          <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
              className="cursor-pointer"
            />
            Show empty folders
          </label>
        </section>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 flex-wrap text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Library
          </button>
          {breadcrumb.map((entry, idx) => {
            const isLast = idx === breadcrumb.length - 1;
            return (
              <span key={entry.id} className="flex items-center gap-1">
                <span className="text-muted-foreground/50">/</span>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(entry.id)}
                  disabled={isLast}
                  className={
                    isLast
                      ? 'text-foreground cursor-default'
                      : 'text-muted-foreground hover:text-foreground transition-colors'
                  }
                >
                  {entry.name}
                </button>
              </span>
            );
          })}
        </nav>

        {/* Folder + item list */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-2">
          <ul className="flex flex-col">
            {visibleFolders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(f.id)}
                  className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Folder size={14} className="shrink-0 opacity-70" />
                  <span className="flex-1 text-sm truncate">{f.name}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
                    ({folderCount(f.id)})
                  </span>
                </button>
              </li>
            ))}
            {itemsHere.map((row) => (
              <li key={`${row.kind}:${row.id}`}>
                <CatalogRow row={row} />
              </li>
            ))}
            {visibleFolders.length === 0 && itemsHere.length === 0 && (
              <li className="px-3 py-6 text-xs font-mono text-muted-foreground/70 text-center">
                {search || kindFilter !== 'all' || instrumentFilter !== 'all'
                  ? 'No matches under the current filters.'
                  : 'Nothing here yet. Create a pattern, composition, or voice variant to populate the catalog.'}
              </li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
