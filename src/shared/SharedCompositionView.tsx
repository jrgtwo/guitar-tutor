/**
 * SharedCompositionView — public viewer for a composition accessed by its UUID.
 *
 * Route: `/?composition=<uuid>`. Mirrors SharedPatternView: RLS allows anon +
 * signed-in clients to read non-private rows. Private rows return empty and
 * we render the not-found state (same level of disclosure as patterns).
 *
 * Preview shape: a vertical list of the composition's placements showing each
 * pattern snapshot's name + repeat count. Intentionally simple for the first
 * pass — a timeline-strip rendering can replace this later without changing
 * the data flow.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  DIFFICULTY_LABELS,
  GENRE_LABELS,
  TAG_LABELS,
  VISIBILITY_LABELS,
  getSupabaseClient,
  isDifficulty,
  isGenre,
  isTag,
  selectIsSignedIn,
  useAuthStore,
  useFretworkStore,
  usePatternsStore,
} from '@fretwork/lib';
import type { Composition } from '@fretwork/lib';
import { Link, navigate } from '../router';

interface Props {
  compositionId: string;
}

type OwnerDescriptor =
  | { kind: 'deleted' }
  | { kind: 'attributed'; displayName: string };

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ok'; composition: Composition; owner: OwnerDescriptor };

export function SharedCompositionView({ compositionId }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      const client = getSupabaseClient();
      const { data: row, error } = await client
        .from('compositions')
        .select('*')
        .eq('id', compositionId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        setState({ kind: 'not-found' });
        return;
      }
      const composition = hydrateRow(row);
      const snapshotName = (row.created_by_display_name as string | null) ?? null;
      const owner: OwnerDescriptor = snapshotName
        ? { kind: 'attributed', displayName: snapshotName }
        : { kind: 'deleted' };
      setState({ kind: 'ok', composition, owner });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [compositionId]);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {state.kind === 'loading' && (
          <p className="text-sm font-mono text-muted-foreground mt-12">Loading composition…</p>
        )}
        {state.kind === 'not-found' && <NotFoundState />}
        {state.kind === 'ok' && (
          <CompositionView composition={state.composition} owner={state.owner} />
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
        Shared Composition
      </span>
    </header>
  );
}

function NotFoundState() {
  return (
    <div className="max-w-md text-center mt-16 flex flex-col items-center gap-3">
      <h1 className="text-xl font-bold">Composition not found</h1>
      <p className="text-sm font-mono text-muted-foreground leading-relaxed">
        This composition doesn't exist, has been removed, or isn't shared publicly.
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

function CompositionView({
  composition,
  owner,
}: {
  composition: Composition;
  owner: OwnerDescriptor;
}) {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const openSignupModal = useAuthStore((s) => s.openSignupModal);
  const forkComposition = usePatternsStore((s) => s.forkComposition);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const validDifficulty = isDifficulty(composition.difficulty) ? composition.difficulty : null;
  const validGenres = composition.genres.filter(isGenre);
  const validTags = composition.tags.filter(isTag);

  const handleFork = () => {
    if (!isSignedIn) {
      openSignupModal('fork-shared-composition');
      return;
    }
    const sourceCreatorName = owner.kind === 'attributed' ? owner.displayName : null;
    const newId = forkComposition(composition, sourceCreatorName);
    // gateCreate refusal returns ''; the prompt is already open so just bail.
    if (!newId) return;
    setFretworkInstrumentId(composition.instrumentId);
    navigate({ kind: 'patterns' });
  };

  // Total length in ticks → approximate bar count using the composition's time
  // signature. Good-enough heuristic for the "Preview" header subtitle.
  const ticksPerBar =
    composition.timeSignature.numerator * (4 / composition.timeSignature.denominator) * 480;
  const totalTicks = composition.placements.reduce(
    (acc, p) => Math.max(acc, p.startTick + p.patternSnapshot.durationTicks * p.repeat),
    0,
  );
  const totalBars = ticksPerBar > 0 ? Math.ceil(totalTicks / ticksPerBar) : 0;

  return (
    <article className="w-full max-w-2xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{composition.name}</h1>
        <Attribution owner={owner} />
        {composition.forkedFromId !== null && (
          <p className="text-xs font-mono text-muted-foreground/80">
            Forked from{' '}
            {composition.forkedFromCreatorName ? (
              <Link
                to={{ kind: 'profile', displayName: composition.forkedFromCreatorName }}
                className="text-foreground hover:underline"
              >
                {composition.forkedFromCreatorName}
              </Link>
            ) : (
              <span className="text-muted-foreground">[Deleted User]</span>
            )}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label={composition.instrumentId} />
        {validDifficulty && <Chip label={DIFFICULTY_LABELS[validDifficulty]} />}
        <Chip
          label={
            VISIBILITY_LABELS[composition.visibility as 'private' | 'unlisted' | 'public'] ??
            composition.visibility
          }
          muted
        />
      </div>

      {composition.description && (
        <section className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {composition.description}
        </section>
      )}

      {(validGenres.length > 0 || validTags.length > 0) && (
        <section className="flex flex-col gap-2">
          {validGenres.length > 0 && (
            <ChipRow label="Genres" values={validGenres.map((g) => GENRE_LABELS[g])} />
          )}
          {validTags.length > 0 && (
            <ChipRow label="Tags" values={validTags.map((t) => TAG_LABELS[t])} />
          )}
        </section>
      )}

      {/* Placement list — simple textual preview. */}
      <section className="rounded-lg border border-border/50 bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Arrangement
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {composition.placements.length} placement
            {composition.placements.length === 1 ? '' : 's'}
            {totalBars > 0 && ` · ~${totalBars} bar${totalBars === 1 ? '' : 's'}`}
            {' · '}
            {composition.timeSignature.numerator}/{composition.timeSignature.denominator}
            {' · '}
            {composition.bpm} BPM
          </span>
        </div>
        {composition.placements.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground/70 py-4 text-center">
            This composition has no placements yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {composition.placements.map((p, idx) => (
              <li
                key={p.id}
                className="flex items-center gap-3 text-sm px-2 py-1.5 rounded-md bg-card/40 border border-border/30"
              >
                <span className="w-6 text-[10px] font-mono text-muted-foreground/60 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate">{p.patternSnapshot.name}</span>
                {p.repeat > 1 && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    ×{p.repeat}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleFork}
          className="h-10 px-5 inline-flex items-center gap-2 rounded-md bg-degree-root hover:bg-degree-root/90 text-charcoal-deep text-sm font-bold transition-colors"
        >
          {isSignedIn ? 'Fork to my library' : 'Sign in to fork'}
        </button>
      </div>
    </article>
  );
}

function Attribution({ owner }: { owner: OwnerDescriptor }) {
  if (owner.kind === 'deleted') {
    return (
      <p className="text-xs font-mono text-muted-foreground">
        Created by <span className="italic">[Deleted User]</span>
      </p>
    );
  }
  return (
    <p className="text-xs font-mono text-muted-foreground">
      Created by{' '}
      <Link
        to={{ kind: 'profile', displayName: owner.displayName }}
        className="text-foreground hover:underline"
      >
        {owner.displayName}
      </Link>
    </p>
  );
}

function Chip({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center h-7 px-2.5 rounded-md border border-input text-[11px] font-mono uppercase tracking-wider ' +
        (muted ? 'bg-card/30 text-muted-foreground' : 'bg-card text-foreground')
      }
    >
      {label}
    </span>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {label}
      </span>
      {values.map((v) => (
        <Chip key={v} label={v} muted />
      ))}
    </div>
  );
}

/**
 * Hydrate a raw Supabase row into a Composition. Mirrors `hydrateCompositionRow`
 * from `lib/src/cloud/sync.ts` (kept local so this view doesn't reach into the
 * editing store).
 */
function hydrateRow(row: Record<string, unknown>): Composition {
  const data = (row.data as Partial<Composition>) ?? ({} as Partial<Composition>);
  return {
    ...(data as Composition),
    id: row.id as string,
    description: data.description ?? (row.description as string | null) ?? null,
    difficulty: data.difficulty ?? (row.difficulty as string | null) ?? null,
    genres: data.genres ?? ((row.genres as string[] | null) ?? []),
    tags: data.tags ?? ((row.tags as string[] | null) ?? []),
    visibility: data.visibility ?? (row.visibility as string | null) ?? 'private',
    publishedAt: data.publishedAt ?? coerceTimestamp(row.published_at),
    forkedFromId: data.forkedFromId ?? (row.forked_from_id as string | null) ?? null,
    forkedFromCreatorName:
      data.forkedFromCreatorName ?? (row.forked_from_creator_name as string | null) ?? null,
    collectionId: data.collectionId ?? (row.collection_id as string | null) ?? null,
  };
}

function coerceTimestamp(v: unknown): number | null {
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof v === 'number') return v;
  return null;
}
