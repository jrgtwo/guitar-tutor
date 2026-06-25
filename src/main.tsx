// MUST be the very first import — sets the Tone.js AudioContext sample rate
// before any other module triggers Tone's lazy context creation. Eliminates
// 4x CPU overhead on systems with 192kHz output devices (some Windows / pro
// audio setups). See audio-context-init.ts for details.
import './audio-context-init';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SoundLab } from './sound-lab/SoundLab';
import { PatternEditorPage } from './patterns/PatternEditorPage';
import { CompositionArrangerPage } from './patterns/CompositionArrangerPage';
import { CatalogPage } from './catalog/CatalogPage';
import { ImportPage } from './import/ImportPage';
import { AuthCallbackHandler } from './auth/AuthCallbackHandler';
import { ProfilePage } from './profile/ProfilePage';
import { ProfileSettings } from './profile/ProfileSettings';
import { SharedPatternView } from './shared/SharedPatternView';
import { SharedCompositionView } from './shared/SharedCompositionView';
import { SharedVoicePresetView } from './shared/SharedVoicePresetView';
import { SharedFolderView } from './shared/SharedFolderView';
import { useLocation, navigate } from './router';
import { usePatternsStore } from '@fretwork/lib';

// Lib design tokens MUST be imported before the app's own stylesheet so Tailwind's
// generated layers can reference the CSS variables.
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css';

// Dev-only: expose the patterns store on window for console debugging.
if (import.meta.env.DEV) {
  (window as unknown as { usePatternsStore: typeof usePatternsStore }).usePatternsStore =
    usePatternsStore;
}

// Public sharing of user content is OFF (private-only posture). The Shared*View
// routes and their UI entry points are gated on this flag — the components stay
// in the codebase, dormant, so sharing can be re-enabled by flipping this.
const SHARING_ENABLED = false;

function SharingDisabledNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-mono text-muted-foreground">
          Sharing isn’t available — content is private.
        </p>
        <button
          type="button"
          onClick={() => navigate({ kind: 'home' })}
          className="mt-3 text-[13px] font-mono uppercase tracking-wider text-degree-root hover:underline"
        >
          Go to the app →
        </button>
      </div>
    </div>
  );
}

// Query-param routing:
//   ?lab=1              → Sound Lab (developer-facing audio tuning surface)
//   ?page=patterns      → Patterns editor
//   ?page=compositions  → Composition arranger
//   ?page=catalog       → Library catalog (cross-kind browser)
//   ?profile=<name>     → Public profile page (signed-in only)
//   ?settings=1         → Profile Settings (signed-in only)
//   ?pattern=<uuid>      → Shared pattern viewer (anon-accessible for non-private rows)
//   ?composition=<uuid>  → Shared composition viewer (anon-accessible for non-private rows)
//   ?voice-preset=<uuid> → Shared voice variant viewer (anon-accessible for non-private rows)
//   ?folder=<uuid>       → Shared folder viewer (anon-accessible for non-private folders)
//   (default)            → Main practice app
function Root() {
  // useLocation subscribes to in-app navigation events (router.navigate) and
  // browser back/forward, so changing routes re-renders without a page reload.
  const { params } = useLocation();
  const isSoundLab = params.get('lab') === '1';
  const page = params.get('page');
  const isPatterns = page === 'patterns';
  const isCompositions = page === 'compositions';
  const isCatalog = page === 'catalog';
  const isImport = page === 'import';
  const profileName = params.get('profile');
  const isSettings = params.get('settings') === '1';
  const sharedPatternId = params.get('pattern');
  const sharedCompositionId = params.get('composition');
  const sharedVoicePresetId = params.get('voice-preset');
  const sharedFolderId = params.get('folder');
  const hasSharedParam =
    !!sharedPatternId || !!sharedCompositionId || !!sharedVoicePresetId || !!sharedFolderId;

  // AuthCallbackHandler must mount alongside every route — it manages the
  // singleton auth subscription and overlays the SignupForm / SignupModal as
  // needed. Without it, no auth state is ever read.
  let body;
  // Public sharing is DISABLED — user content is private-only. The Shared*View
  // components stay in the tree (dormant); flip SHARING_ENABLED to re-enable.
  if (SHARING_ENABLED && sharedPatternId) body = <SharedPatternView patternId={sharedPatternId} />;
  else if (SHARING_ENABLED && sharedCompositionId) body = <SharedCompositionView compositionId={sharedCompositionId} />;
  else if (SHARING_ENABLED && sharedVoicePresetId) body = <SharedVoicePresetView presetId={sharedVoicePresetId} />;
  else if (SHARING_ENABLED && sharedFolderId) body = <SharedFolderView folderId={sharedFolderId} />;
  else if (hasSharedParam) body = <SharingDisabledNotice />;
  else if (isSoundLab) body = <SoundLab />;
  else if (isPatterns) body = <PatternEditorPage />;
  else if (isCompositions) body = <CompositionArrangerPage />;
  else if (isCatalog) body = <CatalogPage />;
  else if (isImport) body = <ImportPage />;
  else if (profileName) body = <ProfilePage displayName={profileName} />;
  else if (isSettings) body = <ProfileSettings />;
  else body = <App />;
  return (
    <>
      {body}
      <AuthCallbackHandler />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
