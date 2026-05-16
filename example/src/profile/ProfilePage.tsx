/**
 * ProfilePage — public-facing profile view at `?profile=<displayName>`.
 *
 * Looks up the profile by case-insensitive display name (the DB has a unique
 * index on lower(display_name) so this is safe). Renders:
 *   - "Not found" if no row matches
 *   - "This profile is private" if profile_public is false AND it's not your own
 *   - The actual profile (with Edit button if it's yours)
 *
 * Signed-in only. Anon viewers should hit the signup CTA modal before reaching
 * here — we'll add the gate when sharing routes go in (Group G).
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Mail, ChevronLeft, Pencil } from 'lucide-react';
import { Link } from '../router';
import {
  getSupabaseClient,
  rowToProfile,
  useAuthStore,
  selectIsSignedIn,
  selectIsAuthLoading,
  type Profile,
} from '@fretwork/lib';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'private' }
  | { kind: 'auth-required' }
  | { kind: 'ok'; profile: Profile };

interface Props {
  displayName: string;
}

export function ProfilePage({ displayName }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const currentUser = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const isAuthLoading = useAuthStore(selectIsAuthLoading);
  const openSignupModal = useAuthStore((s) => s.openSignupModal);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isSignedIn) {
      setState({ kind: 'auth-required' });
      return;
    }
    let cancelled = false;

    async function load() {
      const client = getSupabaseClient();
      // Case-insensitive match. The unique index on lower(display_name) makes
      // a single ilike-result the authoritative lookup.
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .ilike('display_name', displayName)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('[ProfilePage] lookup error:', error);
        setState({ kind: 'not-found' });
        return;
      }
      if (!data) {
        setState({ kind: 'not-found' });
        return;
      }
      const profile = rowToProfile(data);
      const isOwn = currentUser?.id === profile.userId;
      if (!profile.profilePublic && !isOwn) {
        setState({ kind: 'private' });
        return;
      }
      setState({ kind: 'ok', profile });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [displayName, currentUser?.id, isSignedIn, isAuthLoading]);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <Header />
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        {state.kind === 'loading' && <LoadingState />}
        {state.kind === 'auth-required' && (
          <AuthGate onSignIn={() => openSignupModal()} />
        )}
        {state.kind === 'not-found' && <NotFoundState displayName={displayName} />}
        {state.kind === 'private' && <PrivateState displayName={displayName} />}
        {state.kind === 'ok' && (
          <ProfileView
            profile={state.profile}
            isOwn={currentUser?.id === state.profile.userId}
          />
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
        Profile
      </span>
    </header>
  );
}

function LoadingState() {
  return (
    <p className="text-sm font-mono text-muted-foreground mt-12">Loading profile…</p>
  );
}

function AuthGate({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="max-w-md text-center mt-16 flex flex-col items-center gap-4">
      <p className="text-sm font-mono text-muted-foreground">
        Sign in to view profiles.
      </p>
      <button
        type="button"
        onClick={onSignIn}
        className="h-9 px-4 inline-flex items-center rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-medium transition-colors"
      >
        Sign in
      </button>
    </div>
  );
}

function NotFoundState({ displayName }: { displayName: string }) {
  return (
    <div className="max-w-md text-center mt-16">
      <h1 className="text-xl font-bold tracking-tight">Profile not found</h1>
      <p className="text-sm font-mono text-muted-foreground mt-2">
        No user matches &quot;{displayName}&quot;.
      </p>
    </div>
  );
}

function PrivateState({ displayName }: { displayName: string }) {
  return (
    <div className="max-w-md text-center mt-16">
      <h1 className="text-xl font-bold tracking-tight">{displayName}</h1>
      <p className="text-sm font-mono text-muted-foreground mt-2">
        This profile is private.
      </p>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ProfileView({ profile, isOwn }: { profile: Profile; isOwn: boolean }) {
  const hasSocials =
    Object.values(profile.socialHandles).some((v) => typeof v === 'string' && v.length > 0);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-5 bg-charcoal-raised/40 border border-border/40 rounded-lg p-6">
      {/* Header: avatar + name + edit */}
      <header className="flex items-start gap-4">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-degree-root/80 text-charcoal-deep text-xl font-bold inline-flex items-center justify-center">
            {initialsOf(profile.displayName)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
          {profile.pronouns && (
            <p className="text-xs font-mono text-muted-foreground/80 mt-0.5">
              {profile.pronouns}
            </p>
          )}
          {profile.userTypes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {profile.userTypes.map((t) => (
                <span
                  key={t}
                  className="h-5 px-2 inline-flex items-center rounded-full text-[10px] font-mono uppercase tracking-wider bg-degree-root/10 text-degree-root border border-degree-root/30"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {isOwn && (
          <Link
            to={{ kind: 'settings' }}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Edit profile"
          >
            <Pencil size={12} /> Edit
          </Link>
        )}
      </header>

      {/* Bio */}
      {profile.bio && (
        <section className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {profile.bio}
        </section>
      )}

      {/* Links */}
      {(profile.externalLink || hasSocials) && (
        <section className="flex flex-wrap gap-2">
          {profile.externalLink && (
            <a
              href={profile.externalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border/60 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <ExternalLink size={11} /> Website
            </a>
          )}
          {profile.socialHandles.instagram && (
            <SocialPill platform="Instagram" handle={profile.socialHandles.instagram} />
          )}
          {profile.socialHandles.youtube && (
            <SocialPill platform="YouTube" handle={profile.socialHandles.youtube} />
          )}
          {profile.socialHandles.soundcloud && (
            <SocialPill platform="SoundCloud" handle={profile.socialHandles.soundcloud} />
          )}
        </section>
      )}

      {/* Playing details */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/30">
        {profile.instruments.length > 0 && (
          <Field label="Instruments" value={profile.instruments.join(', ')} />
        )}
        {profile.yearsPlaying != null && (
          <Field label="Years playing" value={String(profile.yearsPlaying)} />
        )}
        {profile.skillLevel && (
          <Field label="Skill level" value={profile.skillLevel} capitalize />
        )}
        {profile.genres.length > 0 && (
          <Field label="Preferred genres" value={profile.genres.join(', ')} />
        )}
      </section>

      {/* Lessons availability */}
      {(profile.availableForLessons || profile.lookingForTeacher) && (
        <section className="flex flex-wrap gap-2 pt-4 border-t border-border/30">
          {profile.availableForLessons && (
            <span className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <Mail size={11} /> Available for lessons
            </span>
          )}
          {profile.lookingForTeacher && (
            <span className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30">
              <Mail size={11} /> Looking for a teacher
            </span>
          )}
        </section>
      )}

      {/* TODO (Group G): list of public patterns / compositions / voice presets */}
    </div>
  );
}

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

function SocialPill({ platform, handle }: { platform: string; handle: string }) {
  return (
    <span className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border/60 text-[11px] font-mono text-muted-foreground">
      {platform}: {handle}
    </span>
  );
}
