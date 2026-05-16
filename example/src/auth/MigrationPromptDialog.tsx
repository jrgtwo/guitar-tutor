/**
 * MigrationPromptDialog — blocking modal shown after a fresh signup if the
 * tab's sessionStorage has anon-authored patterns/compositions.
 *
 * Choices: Add (uploads to the cloud library), Discard (deletes session data).
 * Not dismissible without choosing — the app's data state would be ambiguous.
 *
 * After either choice, the in-memory patterns store is reset to defaults so
 * the user starts with a fresh slate. When Group E (cloud sync) lands, the
 * just-uploaded content will hydrate back automatically.
 */
import { useState, useEffect } from 'react';
import { Music2, ListMusic, Loader2, Sliders } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  countSessionContent,
  uploadSessionContent,
  clearSessionContent,
  markMigrationResolved,
  usePatternsStore,
  useAuthStore,
  DEFAULT_PATTERNS_STATE,
  type MigrationCounts,
} from '@fretwork/lib';

interface Props {
  open: boolean;
  onClose(): void;
}

export function MigrationPromptDialog({ open, onClose }: Props) {
  const [counts, setCounts] = useState<MigrationCounts>({
    patterns: 0,
    compositions: 0,
    voicePresets: 0,
    reverbCustomized: false,
    total: 0,
  });
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCounts(countSessionContent());
      setPhase('idle');
      setError(null);
    }
  }, [open]);

  async function handleAdd() {
    setPhase('uploading');
    setError(null);
    const result = await uploadSessionContent();
    if (result.error) {
      setPhase('error');
      setError(result.error);
      return;
    }
    clearSessionContent();
    markMigrationResolved();
    // Reset in-memory store; cloud sync will refill it once it sees the
    // migration flag flip below.
    usePatternsStore.setState({ ...DEFAULT_PATTERNS_STATE });
    // Reactive flag flip triggers cloud sync to start hydrating now that it's
    // safe (no anon content remaining that could be clobbered).
    useAuthStore.getState().setMigrationResolved(true);
    onClose();
  }

  function handleDiscard() {
    clearSessionContent();
    markMigrationResolved();
    usePatternsStore.setState({ ...DEFAULT_PATTERNS_STATE });
    useAuthStore.getState().setMigrationResolved(true);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissible — user must choose */ }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Bring your session work with you?</DialogTitle>
          <DialogDescription>
            We found content you created during this visit. Want to add it to your account?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 my-2 px-2">
          {counts.patterns > 0 && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <Music2 size={14} className="text-degree-root" />
              <span className="text-foreground">
                {counts.patterns} pattern{counts.patterns === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {counts.compositions > 0 && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <ListMusic size={14} className="text-degree-root" />
              <span className="text-foreground">
                {counts.compositions} composition{counts.compositions === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {counts.voicePresets > 0 && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <Sliders size={14} className="text-degree-root" />
              <span className="text-foreground">
                {counts.voicePresets} sound preset{counts.voicePresets === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {counts.reverbCustomized && (
            <div className="flex items-center gap-2 text-sm font-mono">
              <Sliders size={14} className="text-degree-root" />
              <span className="text-foreground">custom reverb settings</span>
            </div>
          )}
        </div>

        {phase === 'error' && error && (
          <p className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={phase === 'uploading'}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {phase === 'uploading' ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Uploading…
              </>
            ) : (
              `Add ${counts.total} item${counts.total === 1 ? '' : 's'} to my account`
            )}
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            disabled={phase === 'uploading'}
            className="h-9 inline-flex items-center justify-center rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Discard
          </button>
        </div>

        <p className="text-[10px] font-mono text-muted-foreground/60 text-center mt-2">
          Discarded content can&apos;t be recovered.
        </p>
      </DialogContent>
    </Dialog>
  );
}
