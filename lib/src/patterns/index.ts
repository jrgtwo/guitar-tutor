/**
 * Public surface of `lib/src/patterns`. Re-exported from `lib/src/index.ts`.
 */
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
} from './types';

export { generateId, generateUuid } from './ids';

export {
  PPQ,
  stepLengthToTicks,
  ticksPerBar,
  ticksPerBeat,
  secondsPerTick,
  ticksToSeconds,
  defaultPatternDurationTicks,
  snapTick,
} from './timebase';

export {
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
  addLane,
  setPatternName,
  setPatternInstrument,
  setPatternDuration,
  setPatternTimeSignature,
  setPatternSuggestedBpm,
  setPatternGroove,
  applyPatternMetadata,
} from './pattern-ops';
export type { PatternMetadataPatch, EventDragSnapshot } from './pattern-ops';

export {
  createEmptyComposition,
  totalDurationTicks,
  addPlacement,
  reorderPlacement,
  setPlacementRepeat,
  removePlacement,
  setCompositionName,
  setCompositionInstrument,
  setCompositionBpm,
  setPlacementSnapshot,
  flattenComposition,
  applyCompositionMetadata,
  setCompositionTempoMode,
  setCompositionGroove,
  setCompositionGrooveMode,
} from './composition-ops';
export type { CompositionMetadataPatch } from './composition-ops';

export {
  MAX_FOLDER_DEPTH,
  createEmptyCollection,
  setCollectionName,
  setCollectionParent,
  applyCollectionMetadata,
  getCollectionDepth,
  wouldCreateCycle,
} from './collection-ops';
export type { CollectionMetadataPatch } from './collection-ops';
export type { FlattenedEvent } from './composition-ops';

export {
  GROOVE_PRESETS,
  presetMatching,
} from './groove';
export type { GroovePresetId, GroovePreset } from './groove';

export { resolveEffectivePlayback } from './scheduler/resolvePlayback';
export type { EffectivePlayback } from './scheduler/resolvePlayback';

export { planCagedInsert, isCagedInsertApplicable } from './caged-insert';
export type {
  CagedInsertRequest,
  CagedInsertMode,
  CagedInsertPlan,
  CagedTraversal,
  PlannedNote,
  ChordQuality,
} from './caged-insert';
