import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SoundLab } from './sound-lab/SoundLab';
import { PatternsPage } from './patterns/PatternsPage';
import { CatalogPage } from './catalog/CatalogPage';
import { AuthCallbackHandler } from './auth/AuthCallbackHandler';
import { ProfilePage } from './profile/ProfilePage';
import { ProfileSettings } from './profile/ProfileSettings';
import { SharedPatternView } from './shared/SharedPatternView';
import { SharedCompositionView } from './shared/SharedCompositionView';
import { SharedVoicePresetView } from './shared/SharedVoicePresetView';
import { SharedFolderView } from './shared/SharedFolderView';
import { useLocation } from './router';

// Lib design tokens MUST be imported before the app's own stylesheet so Tailwind's
// generated layers can reference the CSS variables.
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css';

// Query-param routing:
//   ?lab=1              → Sound Lab (developer-facing audio tuning surface)
//   ?page=patterns      → Patterns editor
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
  const isCatalog = page === 'catalog';
  const profileName = params.get('profile');
  const isSettings = params.get('settings') === '1';
  const sharedPatternId = params.get('pattern');
  const sharedCompositionId = params.get('composition');
  const sharedVoicePresetId = params.get('voice-preset');
  const sharedFolderId = params.get('folder');

  // AuthCallbackHandler must mount alongside every route — it manages the
  // singleton auth subscription and overlays the SignupForm / SignupModal as
  // needed. Without it, no auth state is ever read.
  let body;
  if (sharedPatternId) body = <SharedPatternView patternId={sharedPatternId} />;
  else if (sharedCompositionId) body = <SharedCompositionView compositionId={sharedCompositionId} />;
  else if (sharedVoicePresetId) body = <SharedVoicePresetView presetId={sharedVoicePresetId} />;
  else if (sharedFolderId) body = <SharedFolderView folderId={sharedFolderId} />;
  else if (isSoundLab) body = <SoundLab />;
  else if (isPatterns) body = <PatternsPage />;
  else if (isCatalog) body = <CatalogPage />;
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
