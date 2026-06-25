/**
 * SharedVoicePresetView — public viewer for a voice variant accessed by its UUID.
 *
 * Route: `/?voice-preset=<uuid>`. Same RLS rules as patterns/compositions —
 * non-private rows are readable by anon + signed-in alike.
 *
 * Preview: a one-shot Voice instance is built from the preset on mount and
 * piped through `<AuditionDeck>` so visitors can hear the variant before
 * forking. The Voice is disposed on unmount.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  Voice,
  getSupabaseClient,
  selectIsSignedIn,
  useAuthStore,
  useVoiceStore,
} from '@fretwork/lib';
import type { Variant, VoicePreset } from '@fretwork/lib';
import { Link, navigate } from '../router';
import { AuditionDeck } from '../sound-lab/AuditionDeck';

interface Props {
  presetId: string;
}

type OwnerDescriptor =
  | { kind: 'deleted' }
  | { kind: 'attributed'; displayName: string };

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ok'; variant: Variant; owner: OwnerDescriptor };

export function SharedVoicePresetView({ presetId }: Props) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({ kind: 'loading' });
      const client = getSupabaseClient();
      const { data: row, error } = await client
        .from('voice_presets')
        .select('*')
        .eq('id', presetId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        setState({ kind: 'not-found' });
        return;
      }
      const variant = hydrateRow(row);
      const snapshotName = (row.created_by_display_name as string | null) ?? null;
      const owner: OwnerDescriptor = snapshotName
        ? { kind: 'attributed', displayName: snapshotName }
        : { kind: 'deleted' };
      setState({ kind: 'ok', variant, owner });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {state.kind === 'loading' && (
          <p className="text-sm font-mono text-muted-foreground mt-12">Loading voice…</p>
        )}
        {state.kind === 'not-found' && <NotFoundState />}
        {state.kind === 'ok' && <VariantView variant={state.variant} owner={state.owner} />}
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
        Shared Voice
      </span>
    </header>
  );
}

function NotFoundState() {
  return (
    <div className="max-w-md text-center mt-16 flex flex-col items-center gap-3">
      <h1 className="text-xl font-bold">Voice not found</h1>
      <p className="text-sm font-mono text-muted-foreground leading-relaxed">
        This voice doesn't exist, has been removed, or isn't shared publicly.
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

function VariantView({ variant, owner }: { variant: Variant; owner: OwnerDescriptor }) {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const openSignupModal = useAuthStore((s) => s.openSignupModal);
  const forkVariant = useVoiceStore((s) => s.forkVariant);

  // Audition voice — built once from the preset and disposed on unmount.
  // Rebuilt on preset-id change so navigating to a different shared voice
  // surface doesn't bleed nodes.
  const [voice, setVoice] = useState<Voice | null>(null);
  const [testNote, setTestNote] = useState<string>('A3');

  useEffect(() => {
    const v = new Voice(variant.preset);
    setVoice(v);
    return () => {
      v.dispose();
    };
  }, [variant.preset]);

  const handleFork = () => {
    if (!isSignedIn) {
      openSignupModal('fork-shared-voice');
      return;
    }
    const sourceCreatorName = owner.kind === 'attributed' ? owner.displayName : null;
    const newId = forkVariant(variant, sourceCreatorName);
    if (!newId) return;
    // Drop the viewer and jump to the Sound Lab so the user can tweak.
    navigate({ kind: 'lab' });
  };

  return (
    <article className="w-full max-w-2xl flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{variant.name}</h1>
        <Attribution owner={owner} />
        {variant.forkedFromId !== null && (
          <p className="text-xs font-mono text-muted-foreground/80">
            Forked from{' '}
            {variant.forkedFromCreatorName ? (
              <Link
                to={{ kind: 'profile', displayName: variant.forkedFromCreatorName }}
                className="text-foreground hover:underline"
              >
                {variant.forkedFromCreatorName}
              </Link>
            ) : (
              <span className="text-muted-foreground">[Deleted User]</span>
            )}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip label={variant.instrumentId} />
        <Chip label={variant.family} muted />
        <Chip label={presetSynthKind(variant.preset)} muted />
      </div>

      <section className="rounded-lg border border-border/50 bg-card/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Preview
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Audition the voice — uses your browser audio
          </span>
        </div>
        <AuditionDeck voice={voice} testNote={testNote} setTestNote={setTestNote} />
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

function presetSynthKind(preset: VoicePreset): string {
  return preset.source.kind;
}

function hydrateRow(row: Record<string, unknown>): Variant {
  const preset = row.data as VoicePreset;
  return {
    id: row.id as string,
    name: (row.name as string) ?? 'Untitled',
    instrumentId: row.instrument_id as Variant['instrumentId'],
    family: row.family as Variant['family'],
    collectionId: (row.collection_id as string | null) ?? null,
    preset,
    forkedFromId: (row.forked_from_id as string | null) ?? null,
    forkedFromCreatorName: (row.forked_from_creator_name as string | null) ?? null,
  };
}
