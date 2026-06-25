import { useEffect, useRef, useState } from 'react';
import {
  useAuth,
  useCloudSync,
  useAuthStore,
  selectIsSignedIn,
  selectNeedsProfile,
  countSessionContent,
  hasMigrationBeenResolved,
} from '@fretwork/lib';
import { SignupForm } from './SignupForm';
import { SignupModal } from './SignupModal';
import { MigrationPromptDialog } from './MigrationPromptDialog';
import { UpgradePrompt } from '../subscription/UpgradePrompt';

// Dev-only: expose the auth store on `window.__authStore` so you can run
// `__authStore.getState()` from the console to inspect the state machine.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __authStore?: typeof useAuthStore }).__authStore = useAuthStore;
}

/**
 * AuthCallbackHandler — root-level component that:
 *   - mounts `useAuth()` (singleton auth subscription)
 *   - renders SignupModal whenever it's open
 *   - overlays SignupForm when status = 'needs-profile'
 *   - shows MigrationPromptDialog the first time a user transitions to
 *     'signed-in' AND has anon session content waiting to be migrated
 */
export function AuthCallbackHandler() {
  useAuth();
  // Activate cloud sync alongside the auth subscription. The hook itself
  // watches auth state internally — it's a no-op when signed-out.
  useCloudSync();
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const needsProfile = useAuthStore(selectNeedsProfile);
  const status = useAuthStore((s) => s.status);

  // Track whether the migration prompt has already been resolved this session.
  // We only show it on the first signed-in transition with non-empty session
  // content. Subsequent re-renders (or other tabs signing in) don't re-trigger.
  const [migrationOpen, setMigrationOpen] = useState(false);
  const handledRef = useRef(false);
  // True once we've observed `signed-out` in this tab. Without this gate, a
  // fresh tab opened by an already-signed-in user goes `idle → loading →
  // signed-in` — the final transition looks identical to a real anon→signup
  // and would mis-fire the migration prompt against the user's own cloud
  // content that cloud-sync just mirrored into sessionStorage.
  const wasSignedOutRef = useRef(false);

  useEffect(() => {
    if (status === 'signed-out') {
      wasSignedOutRef.current = true;
    }
  }, [status]);

  useEffect(() => {
    if (!isSignedIn) {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    // Don't prompt if the user already resolved migration in this tab session.
    // Cloud-sync writes session content back to sessionStorage, so checking
    // countSessionContent alone would re-trigger after Add/Discard on reload.
    if (hasMigrationBeenResolved()) {
      handledRef.current = true;
      return;
    }
    // Require a real signed-out → signed-in transition in this tab. On a
    // fresh tab where the user was already authenticated, sessionStorage
    // content (mirrored by cloud-sync) belongs to that same user and must
    // not be treated as anonymous content to migrate.
    if (!wasSignedOutRef.current) {
      handledRef.current = true;
      return;
    }
    const counts = countSessionContent();
    if (counts.total > 0) {
      setMigrationOpen(true);
    }
    handledRef.current = true;
  }, [isSignedIn]);

  return (
    <>
      <SignupModal />
      {needsProfile && (
        <div className="fixed inset-0 z-40 bg-charcoal-deep">
          <SignupForm />
        </div>
      )}
      <MigrationPromptDialog
        open={migrationOpen}
        onClose={() => setMigrationOpen(false)}
      />
      <UpgradePrompt />
    </>
  );
}
