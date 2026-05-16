/**
 * SignupForm — first-time profile creation form, shown when auth status is
 * 'needs-profile' (authenticated but no profile row yet). Calls the
 * `create_profile_with_settings` RPC on submit, then refreshes the profile
 * which moves the user into 'signed-in' status.
 *
 * Required fields: display name (unique, permanent), user_types (multi-select).
 * Optional fields: every other profile field — user can fill or skip.
 *
 * Provider-agnostic — nothing in this form reads provider data. Every value
 * is user-entered.
 */
import { useState } from 'react';
import {
  getSupabaseClient,
  useAuth,
  rowToProfile,
  useAuthStore,
} from '@fretwork/lib';

const USER_TYPE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'hobbyist', label: 'Hobbyist' },
  { value: 'professional', label: 'Professional musician' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'songwriter', label: 'Songwriter / composer' },
  { value: 'producer', label: 'Producer / arranger' },
  { value: 'other', label: 'Other' },
];

const INSTRUMENT_OPTIONS = [
  { value: 'guitar', label: 'Guitar' },
  { value: 'bass', label: 'Bass' },
  { value: 'ukulele', label: 'Ukulele' },
];

const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export function SignupForm() {
  const { refreshProfile } = useAuth();
  const setStatus = useAuthStore((s) => s.setStatus);

  // Required
  const [displayName, setDisplayName] = useState('');
  const [userTypes, setUserTypes] = useState<string[]>([]);

  // Optional
  const [bio, setBio] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [soundcloud, setSoundcloud] = useState('');
  const [instruments, setInstruments] = useState<string[]>([]);
  const [yearsPlaying, setYearsPlaying] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [genres, setGenres] = useState('');
  const [availableForLessons, setAvailableForLessons] = useState(false);
  const [lookingForTeacher, setLookingForTeacher] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle<T>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters.');
      return;
    }
    if (userTypes.length === 0) {
      setError('Pick at least one option for "What kind of user are you?"');
      return;
    }

    setSubmitting(true);
    const client = getSupabaseClient();
    const socialHandles: Record<string, string> = {};
    if (instagram.trim()) socialHandles.instagram = instagram.trim();
    if (youtube.trim()) socialHandles.youtube = youtube.trim();
    if (soundcloud.trim()) socialHandles.soundcloud = soundcloud.trim();

    const yearsParsed = yearsPlaying.trim() ? Number.parseInt(yearsPlaying, 10) : null;
    const genresList = genres
      .split(',')
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    const { data, error: rpcError } = await client.rpc('create_profile_with_settings', {
      p_display_name: displayName.trim(),
      p_user_types: userTypes,
      p_avatar_url: null,
      p_bio: bio.trim() || null,
      p_pronouns: pronouns.trim() || null,
      p_external_link: externalLink.trim() || null,
      p_social_handles: socialHandles,
      p_instruments: instruments,
      p_years_playing: Number.isFinite(yearsParsed) ? yearsParsed : null,
      p_skill_level: skillLevel || null,
      p_genres: genresList,
      p_available_for_lessons: availableForLessons,
      p_looking_for_teacher: lookingForTeacher,
    });

    setSubmitting(false);

    if (rpcError) {
      // Postgres unique-violation code is 23505 (display_name collision).
      if (rpcError.code === '23505' || /duplicate key|unique/i.test(rpcError.message)) {
        setError('That display name is already taken. Try another.');
      } else {
        setError(rpcError.message || 'Failed to create profile.');
      }
      return;
    }

    if (data) {
      // The RPC returns the new profile row; push it straight into the store so
      // the UI updates immediately without a follow-up SELECT round-trip.
      useAuthStore.getState().setProfile(rowToProfile(data));
      setStatus('signed-in');
    } else {
      // Defensive: fall back to a refresh in case the row was created but the
      // RPC return value didn't arrive as expected.
      await refreshProfile();
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-charcoal-deep text-foreground py-8 px-4">
      <form
        onSubmit={handleSubmit}
        className="max-w-xl mx-auto bg-charcoal-raised/60 border border-border/40 rounded-lg p-6 flex flex-col gap-5"
      >
        <header>
          <h1 className="text-xl font-bold tracking-tight">Welcome — set up your profile</h1>
          <p className="text-sm font-mono text-muted-foreground mt-1">
            A couple of required fields, then everything else is optional. You can fill in or edit any of the optional fields later from your profile settings.
          </p>
        </header>

        {/* Display name (required) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Display name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="e.g. guitarguy42"
            className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            required
          />
          <p className="text-[10px] font-mono text-muted-foreground/60">
            Unique and permanent — this is what shows on anything you share.
          </p>
        </div>

        {/* User types (required, multi-select) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            What kind of user are you? <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {USER_TYPE_OPTIONS.map((opt) => {
              const selected = userTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUserTypes(toggle(userTypes, opt.value))}
                  className={[
                    'h-7 px-3 inline-flex items-center rounded-full text-[11px] font-mono border transition-colors',
                    selected
                      ? 'bg-degree-root/80 border-degree-root text-charcoal-deep'
                      : 'border-border/60 bg-charcoal-deep/40 text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60">
            Pick all that apply. Just informational — doesn&apos;t affect what features you can use.
          </p>
        </div>

        <hr className="border-border/30" />

        {/* Optional section */}
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Everything below is optional
        </h2>

        {/* Bio */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="A short blurb about you"
            className="px-3 py-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Pronouns */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Pronouns
            </label>
            <input
              type="text"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              maxLength={30}
              placeholder="e.g. she/her"
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>

          {/* External link */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Website / link
            </label>
            <input
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              maxLength={200}
              placeholder="https://..."
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>
        </div>

        {/* Social handles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Instagram
            </label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@handle"
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              YouTube
            </label>
            <input
              type="text"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="@channel"
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              SoundCloud
            </label>
            <input
              type="text"
              value={soundcloud}
              onChange={(e) => setSoundcloud(e.target.value)}
              placeholder="username"
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>
        </div>

        {/* Instruments */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Primary instrument(s)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUMENT_OPTIONS.map((opt) => {
              const selected = instruments.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInstruments(toggle(instruments, opt.value))}
                  className={[
                    'h-7 px-3 inline-flex items-center rounded-full text-[11px] font-mono border transition-colors',
                    selected
                      ? 'bg-degree-root/80 border-degree-root text-charcoal-deep'
                      : 'border-border/60 bg-charcoal-deep/40 text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Years playing */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Years playing
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={yearsPlaying}
              onChange={(e) => setYearsPlaying(e.target.value)}
              placeholder="0"
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            />
          </div>

          {/* Skill level */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Skill level
            </label>
            <select
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value)}
              className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
            >
              <option value="">—</option>
              {SKILL_LEVELS.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Genres */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Preferred genres
          </label>
          <input
            type="text"
            value={genres}
            onChange={(e) => setGenres(e.target.value)}
            placeholder="e.g. jazz, blues, classical"
            className="h-9 px-3 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/80 text-sm"
          />
          <p className="text-[10px] font-mono text-muted-foreground/60">Comma-separated.</p>
        </div>

        {/* Teacher / student flags */}
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-[12px] font-mono text-foreground">
            <input
              type="checkbox"
              checked={availableForLessons}
              onChange={(e) => setAvailableForLessons(e.target.checked)}
              className="accent-degree-root"
            />
            Available for lessons
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] font-mono text-foreground">
            <input
              type="checkbox"
              checked={lookingForTeacher}
              onChange={(e) => setLookingForTeacher(e.target.checked)}
              className="accent-degree-root"
            />
            Looking for a teacher
          </label>
        </div>

        {/* Submit */}
        {error && (
          <p className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-10 inline-flex items-center justify-center rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating profile…' : 'Create profile'}
        </button>
      </form>
    </div>
  );
}
