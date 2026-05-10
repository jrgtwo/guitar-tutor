/**
 * @fretwork/lib — public surface.
 *
 * Consumer apps import from this entry point. Internal modules import each other via
 * relative paths and are not part of the public contract.
 *
 * To use:
 *
 *   import { Fretboard, TopBar, InfoCard, Legend, SettingsDialog } from '@fretwork/lib';
 *   import '@fretwork/lib/styles/tokens.css';
 *
 *   <TopBar />
 *   <Fretboard />
 *   <InfoCard />
 *   <Legend />
 *
 * Tailwind CSS is required in the consumer; ensure your tailwind.config's `content` array
 * includes node_modules/@fretwork/lib/src so the classes are picked up.
 */

// Top-level renderable components
export { Fretboard } from './components/fretboard/Fretboard';
export { TopBar } from './components/TopBar';
export { InfoCard } from './components/InfoCard';
export { Legend } from './components/Legend';
export { SettingsDialog } from './components/SettingsDialog';

// Individual fretboard sub-components (for consumers wanting to compose their own layout)
export { Headstock } from './components/fretboard/Headstock';
export { FretLines } from './components/fretboard/FretLines';
export { Strings } from './components/fretboard/Strings';
export { CapoBar } from './components/fretboard/CapoBar';
export { NoteMarker } from './components/fretboard/NoteMarker';

// Shared UI primitives (shadcn-style) — useful for consumers building their own controls
export { Button, type ButtonProps } from './components/ui/button';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
} from './components/ui/select';
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './components/ui/dialog';
export { Switch } from './components/ui/switch';
export { RadioGroup, RadioGroupItem } from './components/ui/radio-group';
export { Label } from './components/ui/label';

// Individual control components (for consumers wanting their own control surface)
export { ModeSelect } from './components/controls/ModeSelect';
export { KeySelect } from './components/controls/KeySelect';
export { TypeSelect } from './components/controls/TypeSelect';
export { TuningSelect } from './components/controls/TuningSelect';
export { CapoSelect } from './components/controls/CapoSelect';
export { LabelsSelect } from './components/controls/LabelsSelect';

// State store + URL helpers
export { useFretworkStore } from './store/useFretworkStore';
export {
  DEFAULT_STATE,
  defaultTypeForMode,
  encodeState,
  decodeState,
  readStateFromLocation,
  writeStateToLocation,
} from './lib/url-state';

// Music theory + fretboard math
export {
  noteAt,
  pitchClass,
  pitchClassOfTonic,
  spellInKey,
  intervalLabel,
  degreeNumber,
} from './lib/theory';
export {
  buildGrid,
  effectiveOpenStrings,
  computeHighlights,
  categorize,
  fretX,
  fretCenterX,
  FRET_COUNT,
  STRING_COUNT,
  SINGLE_INLAY_FRETS,
  DOUBLE_INLAY_FRETS,
} from './lib/fretboard';

// Curated data
export { SCALES, getScale, DEFAULT_SCALE_ID } from './lib/scales';
export { ARPEGGIOS, getArpeggio, DEFAULT_ARPEGGIO_ID } from './lib/arpeggios';
export {
  TUNINGS,
  getTuning,
  DEFAULT_TUNING_ID,
  CHROMATIC_KEYS,
  CHROMATIC_NOTES,
} from './lib/tunings';

// Types
export type {
  Mode,
  LabelMode,
  Handedness,
  PitchClass,
  IntervalSet,
  ScaleDef,
  ArpeggioDef,
  TuningDef,
  NoteCell,
  DegreeCategory,
  Highlight,
  FretworkSettings,
  FretworkState,
} from './types';

// Metronome — class, hook, store, data, types
export {
  Metronome,
  useMetronome,
  useMetronomeStore,
  DEFAULT_METRONOME_STATE,
  TIME_SIGNATURES,
  getTimeSignature,
  DEFAULT_TIME_SIGNATURE_ID,
  tickSubdivision,
} from './metronome';
export type {
  TimeSignature,
  MetronomeTickEvent,
  MetronomeEvents,
  MetronomeOptions,
  MetronomeState,
  MetronomeStoreState,
  ClickSound,
  UseMetronomeReturn,
} from './metronome';

// Note playback — class, hook, store, patterns, instrument, types
export {
  Playback,
  usePlayback,
  usePlaybackStore,
  DEFAULT_PLAYBACK_STATE,
  PluckSynthInstrument,
  PLAYBACK_PATTERNS,
  getPlaybackPattern,
  DEFAULT_PATTERN_ID,
  ASCENDING_PITCH_ID,
  STRING_BY_STRING_ID,
  CUSTOM_PATTERN_ID,
  CAGED_PATTERN_IDS,
} from './playback';
export type {
  PlaybackPattern,
  PlaybackOptions,
  PlayableCell,
  GuitarInstrument,
  ResolveInput,
  PlaybackStoreState,
  UsePlaybackReturn,
} from './playback';
