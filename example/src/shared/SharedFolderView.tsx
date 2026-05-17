/**
 * SharedFolderView — public viewer for a folder accessed by its UUID.
 *
 * Route: `/?folder=<uuid>`. RLS allows reading non-private rows for both anon
 * and signed-in clients (see migration 0010).
 *
 * Two independent visibility gates per migration 0010:
 *   - Folder visibility gates whether this page renders at all.
 *   - Each item's own visibility gates whether it shows up in the listing.
 *
 * So the listing query just filters on `collection_id = folderId AND visibility
 * != 'private'` for each kind. Subfolders use the same rule against the
 * `collections` table.
 *
 * Click any item row to navigate into its dedicated shared viewer (`?pattern=`,
 * `?composition=`, `?voice-preset=`). Click a subfolder to navigate to its
 * `?folder=` page. No fork action on the folder itself — fork happens on each
 * item's individual viewer.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Folder } from 'lucide-react';
import { getSupabaseClient } from '@fretwork/lib';
import { Link } from '../router';

// Shared-viewer routes (`?folder=`, `?pattern=`, etc.) aren't part of the
// router's typed Route union — they're query-param-only and the dispatch
// happens in `main.tsx`. To navigate between viewers we update the URL
// directly + fire the same custom event the router subscribes to.
const LOCATION_CHANGE_EVENT = 'fretwork:location-change';

function pushQueryNav(swap: (params: URLSearchParams) => void) {
  const url = new URL(window.location.href);
  // Clear any shared-viewer param so the dispatcher doesn't render two at once.
  for (const k of ['folder', 'pattern', 'composition', 'voice-preset']) {
    url.searchParams.delete(k);
  }
  swap(url.searchParams);
  window.history.pushState({}, '', url);
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

interface Props {
  folderId: string;
}

interface FolderRow {
  id: string;
  name: string;
  visibility: string;
  ownerDisplayName: string | null;
}

interface ItemRow {
  kind: 'pattern' | 'composition' | 'voice-preset';
  id: string;
  name: string;
  instrumentId: string;
  family?: string; // voice-preset only
  visibility: string;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | {
      kind: 'ok';
      folder: FolderRow;
      subfolders: FolderRow[];
      items: ItemRow[];
    };

export function SharedFolderView({ folderId }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      const client = getSupabaseClient();

      // Fetch the folder row first. RLS will block private rows for non-owners.
      const { data: folderRow, error: folderErr } = await client
        .from('collections')
        .select('id, name, visibility, created_by_display_name')
        .eq('id', folderId)
        .maybeSingle();
      if (cancelled) return;
      if (folderErr || !folderRow) {
        setState({ kind: 'not-found' });
        return;
      }

      // In parallel: subfolders + items of each kind. Visibility != 'private'
      // is enforced for any consumer; RLS would also drop private rows the
      // viewer can't read, but the explicit filter keeps the listing honest
      // when the folder owner views their own folder.
      const [subRes, patRes, compRes, voiceRes] = await Promise.all([
        client
          .from('collections')
          .select('id, name, visibility, created_by_display_name')
          .eq('parent_id', folderId)
          .neq('visibility', 'private'),
        client
          .from('patterns')
          .select('id, name, instrument_id, visibility')
          .eq('collection_id', folderId)
          .neq('visibility', 'private'),
        client
          .from('compositions')
          .select('id, name, instrument_id, visibility')
          .eq('collection_id', folderId)
          .neq('visibility', 'private'),
        client
          .from('voice_presets')
          .select('id, name, instrument_id, family, visibility')
          .eq('collection_id', folderId)
          .neq('visibility', 'private'),
      ]);

      if (cancelled) return;

      const folder: FolderRow = {
        id: folderRow.id as string,
        name: folderRow.name as string,
        visibility: folderRow.visibility as string,
        ownerDisplayName: (folderRow.created_by_display_name as string | null) ?? null,
      };
      const subfolders: FolderRow[] = (subRes.data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        visibility: r.visibility as string,
        ownerDisplayName: (r.created_by_display_name as string | null) ?? null,
      }));
      const items: ItemRow[] = [
        ...(patRes.data ?? []).map((r) => ({
          kind: 'pattern' as const,
          id: r.id as string,
          name: r.name as string,
          instrumentId: r.instrument_id as string,
          visibility: r.visibility as string,
        })),
        ...(compRes.data ?? []).map((r) => ({
          kind: 'composition' as const,
          id: r.id as string,
          name: r.name as string,
          instrumentId: r.instrument_id as string,
          visibility: r.visibility as string,
        })),
        ...(voiceRes.data ?? []).map((r) => ({
          kind: 'voice-preset' as const,
          id: r.id as string,
          name: r.name as string,
          instrumentId: r.instrument_id as string,
          family: r.family as string,
          visibility: r.visibility as string,
        })),
      ];

      setState({ kind: 'ok', folder, subfolders, items });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {state.kind === 'loading' && (
          <p className="text-sm font-mono text-muted-foreground mt-12">Loading folder…</p>
        )}
        {state.kind === 'not-found' && <NotFoundState />}
        {state.kind === 'ok' && (
          <FolderView folder={state.folder} subfolders={state.subfolders} items={state.items} />
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
      <Link
        to={{ kind: 'home' }}
        className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <ChevronLeft size={14} /> Back
      </Link>
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Shared Folder
      </span>
    </header>
  );
}

function NotFoundState() {
  return (
    <div className="max-w-md text-center mt-16 flex flex-col items-center gap-3">
      <h1 className="text-xl font-bold">Folder not found</h1>
      <p className="text-sm font-mono text-muted-foreground leading-relaxed">
        This folder doesn't exist, has been removed, or isn't shared publicly.
      </p>
      <Link
        to={{ kind: 'home' }}
        className="mt-2 h-9 px-4 inline-flex items-center rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        Go to Practice
      </Link>
    </div>
  );
}

function FolderView({
  folder,
  subfolders,
  items,
}: {
  folder: FolderRow;
  subfolders: FolderRow[];
  items: ItemRow[];
}) {
  const isEmpty = subfolders.length === 0 && items.length === 0;
  return (
    <article className="w-full max-w-2xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Folder size={20} className="opacity-70" />
          {folder.name}
        </h1>
        <p className="text-xs font-mono text-muted-foreground">
          Created by{' '}
          {folder.ownerDisplayName ? (
            <Link
              to={{ kind: 'profile', displayName: folder.ownerDisplayName }}
              className="text-foreground hover:underline"
            >
              {folder.ownerDisplayName}
            </Link>
          ) : (
            <span className="italic">[Deleted User]</span>
          )}
        </p>
      </header>

      <section className="rounded-lg border border-border/50 bg-card/40 p-2">
        {isEmpty ? (
          <p className="text-xs font-mono text-muted-foreground/70 py-6 text-center">
            This folder has nothing shared publicly.
          </p>
        ) : (
          <ul className="flex flex-col">
            {subfolders.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => pushQueryNav((p) => p.set('folder', f.id))}
                  className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Folder size={14} className="shrink-0 opacity-70" />
                  <span className="flex-1 text-sm truncate">{f.name}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 shrink-0">
                    {f.visibility}
                  </span>
                </button>
              </li>
            ))}
            {items.map((it) => (
              <li key={`${it.kind}:${it.id}`}>
                <SharedItemRow item={it} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function SharedItemRow({ item }: { item: ItemRow }) {
  const icon = item.kind === 'voice-preset' ? '🎸' : item.kind === 'pattern' ? '♫' : '▤';
  const kindLabel =
    item.kind === 'voice-preset' ? 'voice' : item.kind === 'composition' ? 'composition' : 'pattern';

  const paramName =
    item.kind === 'voice-preset' ? 'voice-preset' : item.kind === 'pattern' ? 'pattern' : 'composition';
  const navigateToItem = () => pushQueryNav((p) => p.set(paramName, item.id));

  return (
    <button
      type="button"
      onClick={navigateToItem}
      className="w-full text-left px-3 py-2 rounded-md flex items-center gap-3 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="w-5 text-base shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 truncate text-sm">{item.name}</span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {kindLabel} · {item.instrumentId}
        {item.family ? ` · ${item.family}` : ''}
      </span>
    </button>
  );
}
