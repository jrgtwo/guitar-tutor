/**
 * SignupModal — the universal "sign up or sign in" CTA modal.
 *
 * Triggered from anywhere via `useAuthStore.openSignupModal(context?)`.
 * Reads open-state from the store; renders a simple gate with a "Continue
 * with Google" button. Dismissible (click outside, Escape, or close button).
 *
 * Provider-agnostic note: the button label is hardcoded to Google here
 * because Google OAuth is the only provider in this phase. When additional
 * providers are added, this becomes a list of provider buttons rather than a
 * provider rewrite.
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui';
import { useAuthStore, useAuth } from '@fretwork/lib';

export function SignupModal() {
  const open = useAuthStore((s) => s.signupModalOpen);
  const close = useAuthStore((s) => s.closeSignupModal);
  const error = useAuthStore((s) => s.error);
  const { signInWithGoogle } = useAuth();

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Sign up or sign in</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            To use this feature, sign up or sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <button
            type="button"
            onClick={() => {
              void signInWithGoogle();
            }}
            className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-md border border-border/70 bg-white hover:bg-white/95 text-charcoal-deep text-sm font-medium transition-colors shadow-sm"
          >
            {/* Google "G" SVG mark */}
            <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC04" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </button>

          {error && (
            <p className="text-xs font-mono text-red-400 text-center">{error}</p>
          )}

          <p className="text-[10px] font-mono text-muted-foreground/60 text-center mt-2">
            By signing up, you agree that your display name is permanent and visible to other signed-in users.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
