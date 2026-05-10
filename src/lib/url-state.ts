/**
 * Bidirectional sync between FretworkState and URL query params.
 * The URL is the public surface for shareable links — be conservative about renaming keys.
 */
import type { FretworkState, Mode, LabelMode, Handedness } from '@/types';
import { SCALES, DEFAULT_SCALE_ID } from './scales';
import { ARPEGGIOS } from './arpeggios';
import { TUNINGS, DEFAULT_TUNING_ID, CHROMATIC_KEYS } from './tunings';

const VALID_MODES: readonly Mode[] = ['scales', 'arpeggios', 'notes'];
const VALID_LABELS: readonly LabelMode[] = ['notes', 'intervals', 'blank'];
const VALID_HANDEDNESS: readonly Handedness[] = ['right', 'left'];

const SCALE_IDS = new Set(SCALES.map((s) => s.id));
const ARP_IDS = new Set(ARPEGGIOS.map((a) => a.id));
const TUNING_IDS = new Set(TUNINGS.map((t) => t.id));
const CHROMATIC_SET = new Set<string>(CHROMATIC_KEYS);

export const DEFAULT_STATE: FretworkState = {
  mode: 'scales',
  key: 'A',
  type: DEFAULT_SCALE_ID,
  tuning: DEFAULT_TUNING_ID,
  capo: 0,
  labels: 'intervals',
  settings: {
    handedness: 'right',
    colorByDegree: true,
    highlightRoot: true,
  },
};

/** Validate that the `type` value matches the chosen `mode`. */
function isValidTypeForMode(mode: Mode, type: string): boolean {
  if (mode === 'scales') return SCALE_IDS.has(type);
  if (mode === 'arpeggios') return ARP_IDS.has(type);
  if (mode === 'notes') return CHROMATIC_SET.has(type);
  return false;
}

/** Sensible default `type` for a mode (used when switching modes invalidates the prior type). */
export function defaultTypeForMode(mode: Mode): string {
  if (mode === 'scales') return DEFAULT_SCALE_ID;
  if (mode === 'arpeggios') return 'maj7';
  return 'C';
}

export function encodeState(state: FretworkState): URLSearchParams {
  const p = new URLSearchParams();
  p.set('mode', state.mode);
  p.set('key', state.key);
  p.set('type', state.type);
  p.set('tuning', state.tuning);
  p.set('capo', String(state.capo));
  p.set('labels', state.labels);
  // Settings: only emit non-default values to keep URLs short.
  const s = state.settings;
  const d = DEFAULT_STATE.settings;
  if (s.handedness !== d.handedness) p.set('hand', s.handedness);
  if (s.colorByDegree !== d.colorByDegree) p.set('color', s.colorByDegree ? '1' : '0');
  if (s.highlightRoot !== d.highlightRoot) p.set('root', s.highlightRoot ? '1' : '0');
  return p;
}

export function decodeState(params: URLSearchParams): FretworkState {
  const mode = (VALID_MODES as readonly string[]).includes(params.get('mode') ?? '')
    ? (params.get('mode') as Mode)
    : DEFAULT_STATE.mode;

  const keyRaw = params.get('key') ?? '';
  const key = CHROMATIC_SET.has(keyRaw) ? keyRaw : DEFAULT_STATE.key;

  const typeRaw = params.get('type') ?? '';
  const type = isValidTypeForMode(mode, typeRaw) ? typeRaw : defaultTypeForMode(mode);

  const tuningRaw = params.get('tuning') ?? '';
  const tuning = TUNING_IDS.has(tuningRaw) ? tuningRaw : DEFAULT_STATE.tuning;

  const capoRaw = parseInt(params.get('capo') ?? '', 10);
  const capo = Number.isFinite(capoRaw) && capoRaw >= 0 && capoRaw <= 11 ? capoRaw : DEFAULT_STATE.capo;

  const labels = (VALID_LABELS as readonly string[]).includes(params.get('labels') ?? '')
    ? (params.get('labels') as LabelMode)
    : DEFAULT_STATE.labels;

  const handednessRaw = params.get('hand') ?? '';
  const handedness = (VALID_HANDEDNESS as readonly string[]).includes(handednessRaw)
    ? (handednessRaw as Handedness)
    : DEFAULT_STATE.settings.handedness;

  const colorByDegree = decodeFlag(params.get('color'), DEFAULT_STATE.settings.colorByDegree);
  const highlightRoot = decodeFlag(params.get('root'), DEFAULT_STATE.settings.highlightRoot);

  return {
    mode,
    key,
    type,
    tuning,
    capo,
    labels,
    settings: { handedness, colorByDegree, highlightRoot },
  };
}

function decodeFlag(raw: string | null, fallback: boolean): boolean {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
}

/** Helper: read state from `window.location.search`. */
export function readStateFromLocation(): FretworkState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  return decodeState(new URLSearchParams(window.location.search));
}

/** Helper: write state to `window.location` via `replaceState` (no history pollution). */
export function writeStateToLocation(state: FretworkState): void {
  if (typeof window === 'undefined') return;
  const search = encodeState(state).toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
}
