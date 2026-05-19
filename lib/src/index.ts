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

// Cloud sync (Supabase): patterns + compositions
export { useCloudSync } from './cloud';

// Auth (Supabase): client, store, hook, and types
export {
  getSupabaseClient,
  isSupabaseConfigured,
  useAuthStore,
  selectIsSignedIn,
  selectNeedsProfile,
  selectIsAuthLoading,
  useAuth,
  rowToProfile,
  readSessionContent,
  countSessionContent,
  uploadSessionContent,
  clearSessionContent,
  markMigrationResolved,
  hasMigrationBeenResolved,
  clearMigrationFlag,
} from './auth';
export type {
  AuthStatus,
  AuthStoreState,
  Profile,
  Session,
  User,
  UseAuthReturn,
  CreateProfileInput,
  MigrationCounts,
  MigrationResult,
} from './auth';

// Top-level renderable components
export { Fretboard, type FretboardProps } from './components/fretboard/Fretboard';
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
export { SelectControl } from './components/controls/SelectControl';
export { ControlGroup } from './components/controls/ControlGroup';
export { InstrumentSelect } from './components/controls/InstrumentSelect';
export { ModeSelect } from './components/controls/ModeSelect';
export { KeySelect } from './components/controls/KeySelect';
export { TypeSelect } from './components/controls/TypeSelect';
export { ShapeSelect } from './components/controls/ShapeSelect';
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
  getTuningsForInstrument,
  DEFAULT_TUNING_ID,
  CHROMATIC_KEYS,
  CHROMATIC_NOTES,
} from './lib/tunings';
export {
  INSTRUMENTS,
  getInstrument,
  DEFAULT_INSTRUMENT_ID,
} from './lib/instruments';

// Types
// Patterns (Phase 1: pattern editor, library, composition arrangement)
export { planCagedInsert, isCagedInsertApplicable } from './patterns';
export type {
  CagedInsertRequest,
  CagedInsertMode,
  CagedInsertPlan,
  CagedTraversal,
  PlannedNote,
  ChordQuality,
} from './patterns';

export {
  generateId,
  generateUuid,
  PPQ,
  stepLengthToTicks,
  ticksPerBar,
  ticksPerBeat,
  secondsPerTick,
  ticksToSeconds,
  defaultPatternDurationTicks,
  snapTick,
  createEmptyPattern,
  clonePattern,
  snapshotPatternForPlacement,
  sortedEvents,
  nextEventStartOnString,
  prevEventEndOnString,
  stampEvent,
  resizeEvent,
  moveEvent,
  moveEventsBy,
  setEventFret,
  deleteEvents,
  setPatternName,
  setPatternInstrument,
  setPatternDuration,
  setPatternTimeSignature,
  applyPatternMetadata,
  createEmptyComposition,
  totalDurationTicks,
  addPlacement,
  reorderPlacement,
  setPlacementRepeat,
  removePlacement,
  setCompositionName,
  setCompositionInstrument,
  setCompositionBpm,
  applyCompositionMetadata,
  MAX_FOLDER_DEPTH,
  createEmptyCollection,
  setCollectionName,
  setCollectionParent,
  applyCollectionMetadata,
  getCollectionDepth,
  wouldCreateCycle,
  flattenComposition,
  GROOVE_PRESETS,
  presetMatching,
  resolveEffectivePlayback,
} from './patterns';
export type {
  Tick,
  StepLength,
  ArticulationId,
  PatternEvent,
  Lane,
  PatternTimeSignature,
  GrooveSpec,
  Pattern,
  Placement,
  Composition,
  Collection,
  Library,
  FlattenedEvent,
  PatternMetadataPatch,
  EventDragSnapshot,
  CompositionMetadataPatch,
  CollectionMetadataPatch,
  GroovePresetId,
  GroovePreset,
  EffectivePlayback,
} from './patterns';
export {
  usePatternsStore,
  DEFAULT_PATTERNS_STATE,
  selectEditingPattern,
  selectEditingComposition,
  findPlacement,
} from './patterns/store/usePatternsStore';
export type {
  PatternsState,
  PatternsActions,
  PatternsStoreState,
  WorkspaceTab,
  SelectionMode,
  PendingStamp,
} from './patterns/store/usePatternsStore';
export { EventScheduler } from './patterns/scheduler/EventScheduler';
export type {
  EventStream,
  ScheduledEvent,
  EventSchedulerOpts,
} from './patterns/scheduler/EventScheduler';
export { PatternSource } from './patterns/scheduler/PatternSource';
export { CompositionSource } from './patterns/scheduler/CompositionSource';

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
  InstrumentDef,
  InstrumentId,
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
  subdivisionCount,
  subdivisionSupportsSwing,
} from './metronome';
export type {
  TimeSignature,
  MetronomeTickEvent,
  MetronomeSubdivisionEvent,
  MetronomeEvents,
  MetronomeOptions,
  MetronomeState,
  MetronomeStoreState,
  ClickSound,
  SubdivisionId,
  UseMetronomeReturn,
} from './metronome';

// Note playback — class, hook, store, patterns, instrument, types
export {
  Playback,
  usePlayback,
  usePlaybackStore,
  DEFAULT_PLAYBACK_STATE,
  PluckSynthInstrument,
  startAudio,
  audioNow,
  Voice,
  MasterBus,
  VOICE_PRESETS,
  ACOUSTIC_GUITAR_PRESET,
  ELECTRIC_GUITAR_PRESET,
  ACOUSTIC_BASS_PRESET,
  ELECTRIC_BASS_PRESET,
  ACOUSTIC_UKULELE_PRESET,
  DEFAULT_REVERB_SETTINGS,
  findPreset,
  resolveActiveVoice,
  useVoiceStore,
  VOICE_STORAGE_KEY,
  ALL_SLOT_IDS,
  getSlotsForInstrument,
  getInstrumentFirstDefaultSlotId,
  getDefaultPresetForSlot,
  parseSlotId,
  makeDefaultActiveVariants,
  buildEffectiveVoice,
  PLAYBACK_PATTERNS,
} from './playback';
export type {
  Variant,
  VariantRef,
  ActiveVariantsMap,
  SlotId,
} from './playback';
export {
  getPlaybackPattern,
  DEFAULT_PATTERN_ID,
  ASCENDING_PITCH_ID,
  STRING_BY_STRING_ID,
  UP_AND_DOWN_ID,
  CUSTOM_PATTERN_ID,
  CAGED_PATTERN_IDS,
  resolveShapeAbsoluteCells,
  getCagedPositionMap,
  getCagedShapeSet,
} from './playback';
export type { AbsoluteCell, CagedShape, CagedShapeId, CagedLetter } from './playback';
export type {
  PlaybackPattern,
  PlaybackOptions,
  PlayableCell,
  GuitarInstrument,
  ResolveInput,
  PlaybackStoreState,
  UsePlaybackReturn,
  FretInstrumentId,
  VoiceFamily,
  VoiceSource,
  PluckSynthParams,
  FMSynthParams,
  OscillatorType,
  ADSREnvelope,
  VoiceLevel,
  BodyFilterParams,
  BodyFilterEnvelope,
  CompressorParams,
  DistortionParams,
  DistortionOversample,
  ChorusParams,
  ChorusType,
  DelayParams,
  EQParams,
  AutoWahParams,
  EffectsConfig,
  VoiceLayer,
  VoicePreset,
  ReverbSettings,
} from './playback';

// Subscription tier model
export {
  TIERS,
  DEFAULT_SUBSCRIPTION,
  isTier,
  TIER_LIMITS,
  KIND_LABELS,
  getCap,
  canCreate,
} from './subscription';
export type { Tier, Subscription, TierLimits, CappedKind, CapCheck } from './subscription';

// Catalog vocabulary + constants for shareable content
export {
  DESCRIPTION_MAX_LENGTH,
  DIFFICULTY_LEVELS,
  DIFFICULTY_LABELS,
  isDifficulty,
  GENRES,
  GENRE_LABELS,
  isGenre,
  filterValidGenres,
  TAGS,
  TAG_LABELS,
  isTag,
  filterValidTags,
  VISIBILITIES,
  VISIBILITY_LABELS,
  VISIBILITY_DESCRIPTIONS,
  isVisibility,
} from './catalog';
export type { Difficulty, Genre, Tag, Visibility } from './catalog';
