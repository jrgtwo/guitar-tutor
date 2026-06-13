/**
 * CatalogPage — `?page=catalog`.
 *
 * Personal-library browser across all kinds. Top filter row scopes by kind +
 * instrument + search; below it the shared `<FolderTree>` renders the whole
 * `collections` taxonomy (user folders + the read-only built-in tree) with
 * folders expanding in place.
 *
 * What this is NOT (yet): a public discovery surface. It only shows the current
 * user's content (anon = whatever's in sessionStorage; signed-in = whatever the
 * cloud sync has hydrated) plus the first-party built-ins.
 */
import { useMemo, useState } from 'react';
import {
  usePatternsStore,
  useVoiceStore,
  BUILTIN_PATTERNS,
  BUILTIN_COMPOSITIONS,
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTION_ID,
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
import { CatalogRowContent, openCatalogItem, type CatalogRowItem } from './CatalogRow';
import { FolderTree } from '../library/FolderTree';

type KindFilter = 'all' | 'voice' | 'pattern' | 'composition';
type InstrumentFilter = 'all' | FretInstrumentId;

export function CatalogPage() {
  const userCollections = usePatternsStore((s) => s.library.collections ?? []);
  const userPatterns = usePatternsStore((s) => s.library.patterns);
  const userCompositions = usePatternsStore((s) => s.library.compositions);
  // Merge the read-only built-in library in (it lives as constants, not in the
  // store), so it shows as an immutable folder tree alongside the user's content.
  const collections = useMemo(
    () => [...BUILTIN_COLLECTIONS, ...userCollections],
    [userCollections],
  );
  const patterns = useMemo(() => [...BUILTIN_PATTERNS, ...userPatterns], [userPatterns]);
  const compositions = useMemo(
    () => [...BUILTIN_COMPOSITIONS, ...userCompositions],
    [userCompositions],
  );
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const variants = useVoiceStore((s) => s.variants);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentFilter>('all');
  const [search, setSearch] = useState('');

  // Heterogeneous item list, scoped by kind + instrument. Name search is handled
  // by the tree (so it can also match + reveal folders).
  const rows: CatalogRowItem[] = useMemo(() => {
    const matchesInstr = (inst: string) =>
      instrumentFilter === 'all' || instrumentFilter === inst;

    const out: CatalogRowItem[] = [];
    if (kindFilter === 'all' || kindFilter === 'voice') {
      for (const v of variants) {
        if (!matchesInstr(v.instrumentId)) continue;
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
  }, [variants, patterns, compositions, draftId, kindFilter, instrumentFilter]);

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
        </section>

        {/* Folder tree */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-2">
          <FolderTree<CatalogRowItem>
            collections={collections}
            items={rows}
            filter={search}
            defaultExpandedIds={[BUILTIN_COLLECTION_ID]}
            onPickItem={openCatalogItem}
            renderItemRow={(row) => <CatalogRowContent row={row} />}
          />
        </section>
      </main>
    </div>
  );
}
