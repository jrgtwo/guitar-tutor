/**
 * UserMenu — small dropdown shown in the TopBar when the user is signed in.
 * Displays avatar/initials + display name, plus Profile / Settings / Sign out.
 */
import { useState, useRef, useEffect } from 'react';
import { LogOut, User as UserIcon, Settings } from 'lucide-react';
import { useAuthStore, useAuth, type Profile } from '@fretwork/lib';

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  profile: Profile;
}

export function UserMenu({ profile }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 inline-flex items-center gap-2 pl-1 pr-2.5 rounded-full bg-charcoal-deep/60 border border-border/60 hover:bg-white/5 text-xs font-mono text-foreground transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="h-6 w-6 rounded-full bg-degree-root/80 text-charcoal-deep text-[10px] font-bold inline-flex items-center justify-center">
            {initialsOf(profile.displayName)}
          </span>
        )}
        <span className="truncate max-w-[120px]">{profile.displayName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 z-30 w-44 rounded-md border border-border/60 bg-charcoal-raised shadow-xl py-1"
        >
          <a
            href={`?profile=${encodeURIComponent(profile.displayName)}`}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <UserIcon size={12} className="opacity-70" />
            Profile
          </a>
          <a
            href="?settings=1"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <Settings size={12} className="opacity-70" />
            Settings
          </a>
          <hr className="border-border/40 my-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
          >
            <LogOut size={12} className="opacity-70" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Convenience wrapper that reads the profile from the store and skips
 *  rendering when there isn't one. */
export function UserMenuWired() {
  const profile = useAuthStore((s) => s.profile);
  if (!profile) return null;
  return <UserMenu profile={profile} />;
}
