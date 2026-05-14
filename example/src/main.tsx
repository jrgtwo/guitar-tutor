import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SoundLab } from './sound-lab/SoundLab';
import { PatternsPage } from './patterns/PatternsPage';
import { seedCommittedPresets } from '@fretwork/lib';
// Lib design tokens MUST be imported before the app's own stylesheet so Tailwind's
// generated layers can reference the CSS variables.
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css';

// Fire-and-forget: load committed preset tunings from `/presets/<id>.json`. The
// fetch happens in parallel with React mounting; if files exist they fill the
// committed-overrides cache and a `fretwork:overrides-changed` event prods
// subscribers (lab + main app's usePlayback) to re-resolve. Failures (no files
// committed yet, offline, etc.) are silent — callers fall through to localStorage
// and then the shipped defaults in `presets.ts`.
void seedCommittedPresets();

// Query-param routing:
//   ?lab=1       → Sound Lab (developer-facing audio tuning surface)
//   ?page=patterns → Patterns (coming soon)
//   (default)    → Main practice app
const params = new URLSearchParams(window.location.search);
const isSoundLab = params.get('lab') === '1';
const isPatterns = params.get('page') === 'patterns';

function Root() {
  if (isSoundLab) return <SoundLab />;
  if (isPatterns) return <PatternsPage />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
