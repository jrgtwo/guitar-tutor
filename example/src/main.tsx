import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SoundLab } from './sound-lab/SoundLab';
// Lib design tokens MUST be imported before the app's own stylesheet so Tailwind's
// generated layers can reference the CSS variables.
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css';

// `?lab=1` opens the Sound Lab — a developer-facing tuning surface for the
// playback voices. Anything else renders the normal app. Lab is intentionally a
// query param so it stays out of the casual user's way; bookmark to revisit.
const params = new URLSearchParams(window.location.search);
const isSoundLab = params.get('lab') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSoundLab ? <SoundLab /> : <App />}
  </StrictMode>,
);
