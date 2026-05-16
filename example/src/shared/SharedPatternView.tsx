/**
 * SharedPatternView — public viewer for a pattern accessed by its UUID.
 *
 * Route: `/?pattern=<uuid>`. RLS allows both anon and signed-in clients to read
 * non-private rows (see migration 0002), so the fetch works for either audience.
 * Private rows return empty and we render the not-found state, which is the
 * intended UX — "this isn't yours and isn't shared" reads identically to "this
 * doesn't exist," which is the right level of disclosure.
 *
 * Chunk 4a scope:
 *   - page shell + fetch + metadata render + read-only preview
 *   - Fork CTA stubbed (anon → SignupModal; signed-in → no-op for now)
 *   - Attribution shown as a non-clickable display name (profile-link wiring
 *     comes in chunk 4c)
 */
import { useEffect, useMemo, useState } from 'react';
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
} from '@fretwork/lib';
import type { Pattern } from '@fretwork/lib';
import { Link } from '../router';
import { MiniPatternSignature } from '../patterns/arranger/MiniPatternSignature';

interface Props {
  patternId: string;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ok'; pattern: Pattern; ownerDisplayName: string | null };

export function SharedPatternView({ patternId }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      const client = getSupabaseClient();
      const { data: row, error } = await client
        .from('patterns')
        .select('*')
        .eq('id', patternId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        setState({ kind: 'not-found' });
        return;
      }
      const pattern = hydrateRow(row);

      // Try to fetch the owner's profile for attribution. Anon clients are blocked
      // by RLS on the profiles table, in which case we silently skip — attribution
      // falls back to "another author." Deleted owners (user_id null) render as
      // "[Deleted User]" regardless.
      let ownerDisplayName: string | null = null;
      if (row.user_id) {
        const { data: prof } = await client
          .from('profiles')
          .select('display_name')
          .eq('user_id', row.user_id)
          .maybeSingle();
        ownerDisplayName = (prof?.display_name as string | undefined) ?? null;
      }
      if (cancelled) return;
      setState({ kind: 'ok', pattern, ownerDisplayName });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patternId]);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {state.kind === 'loading' && (
          <p className="text-sm font-mono text-muted-foreground mt-12">Loading pattern…</p>
        )}
        {state.kind === 'not-found' && <NotFoundState />}
        {state.kind === 'ok' && (
          <PatternView pattern={state.pattern} ownerDisplayName={state.ownerDisplayName} />
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
        Shared Pattern
      </span>
    </header>
  );
}

function NotFoundState() {
  return (
    <div className="max-w-md text-center mt-16 flex flex-col items-center gap-3">
      <h1 className="text-xl font-bold">Pattern not found</h1>
      <p className="text-sm font-mono text-muted-foreground leading-relaxed">
        This pattern doesn't exist, has been removed, or isn't shared publicly.
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

function PatternView({
  pattern,
  ownerDisplayName,
}: {
  pattern: Pattern;
  ownerDisplayName: string | null;
}) {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const openSignupModal = useAuthStore((s) => s.openSignupModal);

  const attribution = useMemo(() => {
    if (ownerDisplayName) return `Created by ${ownerDisplayName}`;
    // Either anon-viewing-without-profile-access, or the creator has been deleted.
    // Both render identically for now; chunk 4c will distinguish them properly using
    // the `profiles.deleted` flag and a clickable profile link for live owners.
    return 'Created by another author';
  }, [ownerDisplayName]);

  const validDifficulty = isDifficulty(pattern.difficulty) ? pattern.difficulty : null;
  const validGenres = pattern.genres.filter(isGenre);
  const validTags = pattern.tags.filter(isTag);

  const handleFork = () => {
    if (!isSignedIn) {
      openSignupModal('fork-shared-pattern');
      return;
    }
    // Real fork action wires in chunk 4d.
    console.info('[SharedPatternView] fork (stub) — will land in chunk 4d');
  };

  return (
    <article className="w-full max-w-2xl flex flex-col gap-6">
      {/* Title + attribution */}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{pattern.name}</h1>
        <p className="text-xs font-mono text-muted-foreground">{attribution}</p>
      </header>

      {/* Quick chips: instrument + difficulty + visibility */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label={pattern.instrumentId} />
        {validDifficulty && <Chip label={DIFFICULTY_LABELS[validDifficulty]} />}
        <Chip
          label={VISIBILITY_LABELS[pattern.visibility as 'private' | 'unlisted' | 'public'] ?? pattern.visibility}
          muted
        />
      </div>

      {/* Description */}
      {pattern.description && (
        <section className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {pattern.description}
        </section>
      )}

      {/* Tags + genres */}
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

      {/* Preview */}
      <section className="rounded-lg border border-border/50 bg-card/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Preview
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {pattern.events.length} events · {pattern.timeSignature.numerator}/
            {pattern.timeSignature.denominator}
          </span>
        </div>
        <MiniPatternSignature
          pattern={pattern}
          width={640}
          height={120}
          instrumentId={pattern.instrumentId}
        />
      </section>

      {/* Fork CTA */}
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
        <Chip key={v} label={v} />
      ))}
    </div>
  );
}

/** Reconstruct a Pattern from a Supabase row. Mirrors the hydration logic in
 *  `lib/src/cloud/sync.ts` but doesn't reach into the editing store. Defensive
 *  defaults cover any field missing from older `data` jsonb. */
function hydrateRow(row: Record<string, unknown>): Pattern {
  const data = (row.data as Partial<Pattern>) ?? ({} as Partial<Pattern>);
  return {
    ...(data as Pattern),
    id: row.id as string,
    description: data.description ?? (row.description as string | null) ?? null,
    difficulty: data.difficulty ?? (row.difficulty as string | null) ?? null,
    genres: data.genres ?? ((row.genres as string[] | null) ?? []),
    tags: data.tags ?? ((row.tags as string[] | null) ?? []),
    visibility: data.visibility ?? (row.visibility as string | null) ?? 'private',
    publishedAt: data.publishedAt ?? coerceTimestamp(row.published_at),
    forkedFromId: data.forkedFromId ?? (row.forked_from_id as string | null) ?? null,
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
