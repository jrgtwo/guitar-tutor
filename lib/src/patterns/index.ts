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
  Pattern,
  Placement,
  Composition,
  Library,
} from './types';

export { generateId } from './ids';

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
  setEventFret,
  deleteEvents,
  addLane,
  setPatternName,
  setPatternDuration,
  setPatternTimeSignature,
} from './pattern-ops';

export {
  createEmptyComposition,
  totalDurationTicks,
  addPlacement,
  reorderPlacement,
  setPlacementRepeat,
  removePlacement,
  setCompositionName,
  setCompositionBpm,
  setPlacementSnapshot,
  flattenComposition,
} from './composition-ops';
export type { FlattenedEvent } from './composition-ops';
