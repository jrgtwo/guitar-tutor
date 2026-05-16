/**
 * SignInButton — TopBar slot. Renders the "Sign in" CTA when signed-out, or
 * the UserMenu when signed-in. Hidden while auth is loading to avoid a flash
 * of the wrong state on initial page load.
 */
import { useAuthStore, selectIsSignedIn, selectIsAuthLoading } from '@fretwork/lib';
import { UserMenuWired } from './UserMenu';

export function SignInButton() {
  const status = useAuthStore((s) => s.status);
  const openSignupModal = useAuthStore((s) => s.openSignupModal);
  const isLoading = useAuthStore(selectIsAuthLoading);
  const isSignedIn = useAuthStore(selectIsSignedIn);

  // While we're still resolving the initial auth state, don't render anything
  // (no flashing "Sign in" → flash of UserMenu on page load).
  if (isLoading) {
    return <div className="h-8 w-20 rounded-md bg-white/[0.02]" aria-hidden />;
  }

  if (isSignedIn) {
    return <UserMenuWired />;
  }

  // needs-profile and signed-out both render the Sign in button. The
  // AuthCallbackHandler will overlay the profile form when status is
  // needs-profile, but having the button visible is fine.
  void status;
  return (
    <button
      type="button"
      onClick={() => openSignupModal()}
      className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider bg-degree-root/80 hover:bg-degree-root text-charcoal-deep transition-colors"
    >
      Sign in
    </button>
  );
}
