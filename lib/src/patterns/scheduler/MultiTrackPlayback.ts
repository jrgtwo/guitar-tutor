/**
 * MultiTrackPlayback — orchestrates simultaneous playback of every track in
 * a Composition.
 *
 * For each `Composition.Track` this builds a (Voice, per-track Gain,
 * EventScheduler) tuple. Audio flows:
 *
 *   Voice[i] → trackGain[i] → masterGain → MasterBus
 *
 * Per-track `volumeDb`, `muted`, and `soloed` flags translate into the
 * track gain's linear value. Solo follows standard DAW semantics: if any
 * track is soloed, every non-soloed track is silenced.
 *
 * One scheduler is the "primary" — its head / active / placement-change
 * callbacks drive the UI. The non-primary schedulers play their notes
 * silently into the void in terms of UI events; their audio rings through
 * their own voice chain.
 *
 * The implementation does NOT subscribe to the store directly. Live
 * updates (volume slider drag, mute toggle) come in via `applyTrackState`
 * which the host hook calls whenever the underlying composition slice
 * changes.
 */

import * as Tone from 'tone';
import type { Composition, Track } from '../types';
import type { TuningDef } from '../../types';
import type { Metronome } from '../../metronome';
import { EventScheduler, type ScheduledEvent } from './EventScheduler';
import { CompositionTrackSource } from './CompositionTrackSource';
import type { GuitarInstrument } from '../../playback/types';
import { MasterBus } from '../../playback/voices/MasterBus';

export interface BuildVoiceForTrack {
  (track: Track): GuitarInstrument & { setRoutingTarget(target: Tone.ToneAudioNode | null): void; dispose(): void };
}

export interface MultiTrackPlaybackOpts {
  composition: Composition;
  metronome: Metronome;
  tuning: TuningDef;
  capo: number;
  /** Factory: caller builds a Voice instance for each Track. The Voice is
   *  expected to have `autoConnectToMaster: false` so this manager can
   *  insert the per-track Gain. */
  buildVoice: BuildVoiceForTrack;
}

interface TrackEntry {
  trackId: string;
  scheduler: EventScheduler;
  voice: ReturnType<BuildVoiceForTrack>;
  gain: Tone.Gain;
}

const NEG_INF_GAIN = 0.0001; // ~-80 dB; effectively silent without -Infinity quirks

export class MultiTrackPlayback {
  private _composition: Composition;
  private _entries: TrackEntry[] = [];
  private _masterGain: Tone.Gain;
  /** The track whose scheduler drives onHead / onActive / onPlacementChange
   *  in the UI. Defaults to the first track. */
  private _primaryTrackId: string;

  constructor(opts: MultiTrackPlaybackOpts) {
    this._composition = opts.composition;
    this._primaryTrackId = opts.composition.tracks[0]?.id ?? '';

    // Master gain sits between every per-track gain and MasterBus. Hosts the
    // composition.masterVolumeDb fader.
    this._masterGain = new Tone.Gain(dbToLinearGain(opts.composition.masterVolumeDb ?? 0));
    MasterBus.connectVoice(this._masterGain);

    for (const track of opts.composition.tracks ?? []) {
      const voice = opts.buildVoice(track);
      const gain = new Tone.Gain(0); // start silent; applyTrackState below sets real value
      voice.setRoutingTarget(gain);
      gain.connect(this._masterGain);
      const scheduler = new EventScheduler({
        metronome: opts.metronome,
        instrument: voice,
        tuning: opts.tuning,
        capo: opts.capo,
      });

      const stream = new CompositionTrackSource(opts.composition, track.id);
      scheduler.setStream(stream);

      this._entries.push({ trackId: track.id, scheduler, voice, gain });
    }
    this.applyTrackState();
  }

  /**
   * Push the current composition's per-track volume / mute / solo flags
   * into the audio-rate Gains. Cheap; safe to call on every store change.
   */
  applyTrackState(): void {
    const anySoloed = this._composition.tracks.some((t) => t.soloed);
    for (const entry of this._entries) {
      const track = this._composition.tracks.find((t) => t.id === entry.trackId);
      if (!track) continue;
      const audible = !track.muted && (!anySoloed || track.soloed);
      const target = audible ? dbToLinearGain(track.volumeDb ?? 0) : NEG_INF_GAIN;
      entry.gain.gain.rampTo(target, 0.02); // 20 ms ramp avoids clicks
    }
  }

  /** Update the in-memory composition snapshot (e.g. after a store mutation
   *  added a new placement or changed a track's volume). Returns true if
   *  the structural shape changed and the caller should rebuild. */
  updateComposition(next: Composition): boolean {
    const sameTracks =
      next.tracks.length === this._composition.tracks.length &&
      next.tracks.every((t, i) => t.id === this._composition.tracks[i]?.id);
    this._composition = next;
    // Master volume:
    this._masterGain.gain.rampTo(dbToLinearGain(next.masterVolumeDb ?? 0), 0.02);
    if (!sameTracks) return true;
    // Refresh each scheduler's stream so newly-edited placements take
    // effect on the next play. Cheap because CompositionTrackSource
    // constructs a slice-indexed array eagerly.
    for (const entry of this._entries) {
      entry.scheduler.setStream(new CompositionTrackSource(next, entry.trackId));
    }
    this.applyTrackState();
    return false;
  }

  /** Returns the EventScheduler whose callbacks drive UI state (head tick,
   *  active events, placement change). */
  get primaryScheduler(): EventScheduler | null {
    return this._entries.find((e) => e.trackId === this._primaryTrackId)?.scheduler ?? null;
  }

  /** Each track's scheduler — used by callers that need to set tuning/capo
   *  / loop on every scheduler in one go. */
  get schedulers(): readonly EventScheduler[] {
    return this._entries.map((e) => e.scheduler);
  }

  /** Sync tuning + capo across every scheduler. */
  setTuning(tuning: TuningDef, capo: number): void {
    for (const entry of this._entries) {
      entry.scheduler.setTuning(tuning, capo);
    }
  }

  setLoop(loop: boolean): void {
    for (const entry of this._entries) {
      entry.scheduler.setLoop(loop);
    }
  }

  /** Subscribe to active events on a specific track. Useful for the
   *  arranger UI that wants per-lane highlighting (Phase 4). */
  onTrackActive(
    trackId: string,
    listener: (events: readonly ScheduledEvent[]) => void,
  ): () => void {
    const entry = this._entries.find((e) => e.trackId === trackId);
    if (!entry) return () => {};
    return entry.scheduler.onActive(listener);
  }

  dispose(): void {
    for (const entry of this._entries) {
      entry.scheduler.dispose();
      entry.voice.dispose();
      try {
        entry.gain.disconnect();
      } catch {
        // already disconnected
      }
      entry.gain.dispose();
    }
    this._entries = [];
    try {
      this._masterGain.disconnect();
    } catch {
      // already disconnected
    }
    MasterBus.disconnectVoice(this._masterGain);
    this._masterGain.dispose();
  }
}

function dbToLinearGain(db: number): number {
  // 0 dB = 1.0, -6 dB ≈ 0.5, +6 dB ≈ 2.0
  return Math.pow(10, db / 20);
}
