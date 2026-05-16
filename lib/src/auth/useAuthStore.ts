/**
 * Zustand store for auth state.
 *
 * NOT persisted — Supabase already manages the auth token in its own
 * localStorage namespace. This store just mirrors what Supabase tells us so
 * React components can read it via selectors. On a hard reload, useAuth will
 * re-hydrate from supabase.auth.getSession() and refetch the profile row.
 *
 * Status flow:
 *
 *     idle → loading → signed-out
 *                    ↘ needs-profile (auth ok, no profile row) → signed-in
 *                    ↘ signed-in (auth ok, profile loaded)
 */
import { create } from 'zustand';
import type { AuthStatus, Profile, Session, User } from './types';

export interface AuthStoreState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  status: AuthStatus;
  error: string | null;

  /** When true, the signup CTA modal is open. */
  signupModalOpen: boolean;
  /** Optional context tag for the modal — e.g. 'fork', 'share', 'comment'.
   *  Useful for future context-aware messaging ("Sign up to fork this riff");
   *  the modal copy can rotate based on this. Null = generic gate. */
  signupModalContext: string | null;
  /** Reactive mirror of the sessionStorage migration-resolved flag. Drives
   *  cloud-sync's hydration deferral: while there's pending anon→signed-in
   *  migration content, hydration is held back so it doesn't clobber the
   *  session storage that the migration is about to upload from. */
  migrationResolved: boolean;

  // Setters used by useAuth; not typically called from components directly.
  setSession(session: Session | null): void;
  setProfile(profile: Profile | null): void;
  setStatus(status: AuthStatus): void;
  setError(error: string | null): void;
  openSignupModal(context?: string): void;
  closeSignupModal(): void;
  setMigrationResolved(resolved: boolean): void;
  reset(): void;
}

const INITIAL: Omit<
  AuthStoreState,
  | 'setSession'
  | 'setProfile'
  | 'setStatus'
  | 'setError'
  | 'openSignupModal'
  | 'closeSignupModal'
  | 'setMigrationResolved'
  | 'reset'
> = {
  user: null,
  session: null,
  profile: null,
  status: 'idle',
  error: null,
  signupModalOpen: false,
  signupModalContext: null,
  // Seed from the sessionStorage flag so a refresh inside an already-migrated
  // tab keeps the resolved state.
  migrationResolved: typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('fretwork:migration-done') === '1'
    : false,
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  ...INITIAL,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
    }),
  setProfile: (profile) => set({ profile }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  openSignupModal: (context) =>
    set({ signupModalOpen: true, signupModalContext: context ?? null }),
  closeSignupModal: () => set({ signupModalOpen: false, signupModalContext: null }),
  setMigrationResolved: (resolved) => set({ migrationResolved: resolved }),
  reset: () => set({ ...INITIAL, status: 'signed-out', migrationResolved: false }),
}));

// ─── Convenience selectors ────────────────────────────────────────────────

export function selectIsSignedIn(s: AuthStoreState): boolean {
  return s.status === 'signed-in';
}

export function selectNeedsProfile(s: AuthStoreState): boolean {
  return s.status === 'needs-profile';
}

export function selectIsAuthLoading(s: AuthStoreState): boolean {
  return s.status === 'idle' || s.status === 'loading';
}
