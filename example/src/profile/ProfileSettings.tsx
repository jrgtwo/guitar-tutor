import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Save,
  User,
  Music,
  Globe,
  AlertCircle,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import {
  getSupabaseClient,
  useAuth,
  useAuthStore,
  type Profile
} from '@fretwork/lib';
import { DeleteAccountFlow } from './DeleteAccountFlow';
import { Link } from '../router';

export function ProfileSettings() {
  const { refreshProfile } = useAuth();
  const profile = useAuthStore((s) => s.profile);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [showDeleteFlow, setShowDeleteFlow] = useState(false);
  
  // Local form state
  const [formData, setFormData] = useState<Partial<Profile>>({});

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorState(null);

    try {
      const client = getSupabaseClient();
      
      // Transform camelCase formData back to snake_case for Supabase
      // Note: We only update the fields we've actually touched or are in the form
      const updatePayload: any = {};
      
      if (formData.bio !== undefined) updatePayload.bio = formData.bio;
      if (formData.pronouns !== undefined) updatePayload.pronouns = formData.pronouns;
      if (formData.externalLink !== undefined) updatePayload.external_link = formData.externalLink;
      if (formData.socialHandles !== undefined) updatePayload.social_handles = formData.socialHandles;
      if (formData.instruments !== undefined) updatePayload.instruments = formData.instruments;
      if (formData.yearsPlaying !== undefined) updatePayload.years_playing = formData.yearsPlaying;
      if (formData.skillLevel !== undefined) updatePayload.skill_level = formData.skillLevel;
      if (formData.genres !== undefined) updatePayload.genres = formData.genres;
      if (formData.availableForLessons !== undefined) updatePayload.available_for_lessons = formData.availableForLessons;
      if (formData.lookingForTeacher !== undefined) updatePayload.looking_for_teacher = formData.lookingForTeacher;
      if (formData.profilePublic !== undefined) updatePayload.profile_public = formData.profilePublic;

      const { error: updateError } = await client
        .from('profiles')
        .update(updatePayload)
        .eq('user_id', profile?.userId);

      if (updateError) throw updateError;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await refreshProfile();
    } catch (err: any) {
      console.error('[ProfileSettings] Save error:', err);
      setErrorState(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-charcoal-deep text-foreground">
        <p className="font-mono text-muted-foreground">Loading profile settings...</p>
      </div >
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      {showDeleteFlow && <DeleteAccountFlow onClose={() => setShowDeleteFlow(false)} />}

      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Link
          to={{ kind: 'home' }}
          className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={14} /> Back
        </Link>
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Settings
        </span >
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <form onSubmit={handleSave} className="space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1 >
            {saveSuccess && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-mono animate-in fade-in slide-in-from-right-4">
                <CheckCircle2 size={16} /> Saved successfully
              </div >
            )}
          </div >

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono">
              <AlertCircle size={16} /> {error}
            </div >
          )}

          {/* Section: Personal Info */}
          <section className="space-y-4 bg-charcoal-raised/20 p-6 rounded-lg border border-border/20">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground uppercase tracking-wider">
              <User size={16} />
              <span >Personal Info</span >
            </div >

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground">Display Name (Permanent)</label>
                <input
                  type="text"
                  disabled
                  value={profile.displayName}
                  className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
              </div >

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground">Bio</label>
                <textarea
                  rows={3}
                  value={formData.bio ?? ''}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                  placeholder="Tell us about yourself..."
                />
              </div >

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground">Pronouns</label>
                  <input
                    type="text"
                    value={formData.pronouns ?? ''}
                    onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
                    className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                    placeholder="e.g. they/them"
                  />
                </div >
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground">External Link</label>
                  <input
                    type="text"
                    value={formData.externalLink ?? ''}
                    onChange={(e) => setFormData({ ...formData, externalLink: e.target.value })}
                    className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                    placeholder="https://..."
                  />
                </div >
              </div >
            </div >
          </section>

          {/* Section: Musical Background */}
          <section className="space-y-4 bg-charcoal-raised/20 p-6 rounded-lg border border-border/20">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground uppercase tracking-wider">
              <Music size={16} />
              <span >Musical Background</span >
            </div >

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground">Instruments (comma separated)</label>
                <input
                  type="text"
                  value={formData.instruments?.join(', ') ?? ''}
                  onChange={(e) => setFormData({ ...formData, instruments: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '') })}
                  className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                  placeholder="guitar, bass, ukulele"
                />
              </div >

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground">Years Playing</label>
                  <input
                    type="number"
                    value={formData.yearsPlaying ?? ''}
                    onChange={(e) => setFormData({ ...formData, yearsPlaying: e.target.value === '' ? null : parseInt(e.target.value) })}
                    className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                  />
                </div >
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-muted-foreground">Skill Level</label>
                  <select
                    value={formData.skillLevel ?? ''}
                    onChange={(e) => setFormData({ ...formData, skillLevel: e.target.value })}
                    className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                  >
                    <option value="">Select level</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div >
              </div >

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground">Preferred Genres (comma separated)</label>
                <input
                  type="text"
                  value={formData.genres?.join(', ') ?? ''}
                  onChange={(e) => setFormData({ ...formData, genres: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '') })}
                  className="w-full bg-charcoal-deep border border-border/40 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-degree-root/50 transition-colors"
                  placeholder="blues, jazz, rock"
                />
              </div >
            </div >
          </section>

          {/* Section: Privacy */}
          <section className="space-y-4 bg-charcoal-raised/20 p-6 rounded-lg border border-border/20">
            <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground uppercase tracking-wider">
              <Globe size={16} />
              <span >Privacy</span >
            </div >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Public Profile</label>
                <p className="text-xs text-muted-foreground">Allow others to see your profile page.</p>
              </div >
              <button
                type="button"
                onClick={() => setFormData({ ...formData, profilePublic: !formData.profilePublic })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  formData.profilePublic ? 'bg-degree-root' : 'bg-charcoal-deep border border-border/40'
                }`}
              >
                <span
                  className={` ${
                    formData.profilePublic ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div >
          </section>

          {/* Section: Danger Zone */}
          <section className="space-y-4 bg-red-500/5 p-6 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2 text-sm font-mono text-red-400 uppercase tracking-wider">
              <AlertTriangle size={16} />
              <span className="text-red-400">Danger Zone</span >
            </div >
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-red-400">Delete Account</h3>
              <p className="text-sm text-muted-foreground">
                This will permanently delete your account and all your private content. This action is irreversible.
              </p>
            </div >
            <button
              type="button"
              onClick={() => setShowDeleteFlow(true)}
              className="w-full h-10 px-4 rounded-md bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-bold hover:bg-red-500/20 transition-colors"
            >
              Delete Account
            </button>
          </section>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 px-6 inline-flex items-center gap-2 rounded-md bg-degree-root hover:bg-degree-root/90 text-charcoal-deep text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save Changes
                </>
              )}
            </button>
          </div >
        </form>
      </main>
    </div >
  );
}
