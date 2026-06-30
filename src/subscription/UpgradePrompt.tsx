/**
 * UpgradePrompt — modal shown to signed-in users when a content-create action
 * is refused for hitting their tier cap. Triggered globally via
 * `useAuthStore.openUpgradePrompt(context)` from store actions (see
 * `gateCreate` in `usePatternsStore`).
 *
 * Anon users hit `SignupModal` instead — they have no account to upgrade.
 *
 * Stripe wiring is deferred; the upgrade button is intentionally a stub
 * acknowledging that.
 */
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui';
import { KIND_LABELS, useAuthStore } from '@fretwork/lib';

export function UpgradePrompt() {
  const open = useAuthStore((s) => s.upgradePromptOpen);
  const context = useAuthStore((s) => s.upgradePromptContext);
  const close = useAuthStore((s) => s.closeUpgradePrompt);

  const kindLabel = context ? KIND_LABELS[context.kind] : 'items';
  const capLabel = context && Number.isFinite(context.cap) ? context.cap.toString() : 'the limit';

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-degree-root" />
            You've hit the Free limit
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Free accounts can have up to {capLabel} {kindLabel}. Upgrade to Pro to
            keep creating — plus unlock features that are coming soon.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2 text-sm">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Pro includes
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-foreground/90">
            <li>· Unlimited patterns, compositions, and voice variants</li>
            <li>· MIDI input for pattern creation (coming soon)</li>
            <li>· Multi-instrument band playback (coming soon)</li>
            <li>· Pattern + audio exports (coming soon)</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <button
            type="button"
            disabled
            title="Stripe checkout isn't wired up yet — coming in a follow-up."
            className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-md bg-degree-root text-charcoal-deep text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Upgrade to Pro (coming soon)
          </button>
          <button
            type="button"
            onClick={close}
            className="h-9 px-3 inline-flex items-center justify-center rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Not now
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          You can also delete some existing {kindLabel} to make room.
        </p>
      </DialogContent>
    </Dialog>
  );
}
