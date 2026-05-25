/**
 * Voice — a configurable `GuitarInstrument` built from a `VoicePreset`.
 *
 * Signal chain (top of file):
 *
 *   synth ─► [bodyFilter] ─► [compressor] ─► [distortion] ─► [chorus] ─►
 *                            [delay] ─► [eq] ─► [autoWah] ─► [cabIR] ─►
 *                                                            volume ─► pan ─► output
 *
 * Bracketed nodes are optional — they are constructed only when their config is
 * present on the preset. `volume` and `pan` are always present so every voice
 * can be balanced individually. `output` connects into the `MasterBus`, which
 * provides global reverb and routes to the audio destination.
 *
 * Mutability: the synth + chain are built once per Voice instance. Almost all
 * parameters can be **mutated in place** via `updateSynthParams()` and
 * `updateEffects()`. Adding or removing a chain node (e.g. enabling the
 * compressor for the first time) triggers a chain rebuild so the new node can
 * be inserted at the correct position.
 */
import * as Tone from 'tone';
import type {
  ADSREnvelope,
  AutoWahParams,
  BodyFilterEnvelope,
  BodyFilterParams,
  ChorusParams,
  ChorusType,
  CompressorParams,
  DelayParams,
  DistortionParams,
  EQParams,
  EffectsConfig,
  PluckSynthParams,
  FMSynthParams,
  OscillatorType,
  VoiceLayer,
  VoiceLevel,
  VoicePreset,
  VoiceSource,
} from './types';
import { MasterBus } from './MasterBus';
import { noteTriggered } from '../audio-debug';
import type { GuitarInstrument } from '../types';

export const DEFAULT_VOICE_LEVEL: VoiceLevel = { volumeDb: 0, pan: 0 };

interface ChainNodes {
  bodyFilter?: Tone.Filter;
  /** FrequencyEnvelope driving `bodyFilter.frequency`, triggered per note. Only
   *  present when the body filter has an `envelope` config. */
  bodyFilterEnvelope?: Tone.FrequencyEnvelope;
  compressor?: Tone.Compressor;
  distortion?: Tone.Distortion;
  chorus?: Tone.Chorus;
  delay?: Tone.FeedbackDelay;
  eq?: Tone.EQ3;
  autoWah?: Tone.AutoWah;
  /** Cabinet IR convolution — last static stage before volume/pan, modelling
   *  the speaker + mic. Loads its IR file asynchronously; passes audio
   *  through (uncolored) until the IR is fetched and decoded. */
  cabIR?: Tone.Convolver;
  /** Makeup gain applied right after the convolver. Compensates for the
   *  loudness shift convolution introduces (some IRs come out hotter than
   *  dry, some quieter; depends on the IR's spectral shape). */
  cabIRMakeup?: Tone.Gain;
  // Always present:
  volume?: Tone.Volume;
  panner?: Tone.Panner;
}

type SynthNode = Tone.PluckSynth | Tone.FMSynth | Tone.Sampler;

export class Voice implements GuitarInstrument {
  private _preset: VoicePreset;
  private _synth: SynthNode | null = null;
  /** Optional second synth for sub-body / harmonic stacking. Triggered alongside
   *  the primary on every note, possibly transposed. */
  private _layerSynth: SynthNode | null = null;
  /** Gain that controls the layer's mix level relative to the primary. */
  private _layerGain: Tone.Gain | null = null;
  /** Always-present mixer node so layer + primary feed the same chain entry. */
  private _mixer: Tone.Gain | null = null;
  /** Always-present vibrato node. Depth=0 when idle; `play()` schedules
   *  depth ramps for per-note vibrato. */
  private _vibrato: Tone.Vibrato | null = null;
  /** Always-present pitch-shifter node. Pitch=0 when idle; `play()`
   *  schedules pitch ramps for per-note slides. Monophonic only: notes
   *  overlapping with an active slide will share the pitch shift. */
  private _pitchShift: Tone.PitchShift | null = null;
  /** Always-present low-pass filter for palm-mute timbre. Cutoff sits at
   *  ~20 kHz (inaudible attenuation) when idle; ramps down to ~600 Hz for
   *  the duration of palm-muted notes to deliver the chunky dampened tone. */
  private _palmMuteFilter: Tone.Filter | null = null;
  private _chain: ChainNodes = {};
  private _exit: Tone.ToneAudioNode | null = null;
  private _connectedToMaster = false;
  /** Voices default to auto-connecting their output to the master bus. The
   *  multi-track playback path opts out so it can insert per-track gain
   *  nodes between the voice and master. */
  private _autoConnectToMaster = true;
  /** Set by the multi-track wiring; `_ensureBuilt` connects the chain
   *  exit to this node instead of MasterBus when present. */
  private _customRoutingTarget: Tone.ToneAudioNode | null = null;

  constructor(preset: VoicePreset, options?: { autoConnectToMaster?: boolean }) {
    this._preset = preset;
    if (options?.autoConnectToMaster === false) this._autoConnectToMaster = false;
  }

  get preset(): VoicePreset {
    return this._preset;
  }

  get output(): Tone.ToneAudioNode | undefined {
    return this._exit ?? undefined;
  }

  // ─── Build / tear down ───────────────────────────────────────────────────────

  /** Eagerly construct the synth + audio chain. Normally `play()` does this
   *  lazily on first call, but callers that need the chain ready before the
   *  first note (most importantly MultiTrackPlayback wiring per-track
   *  routing during composition setup) should call this explicitly so any
   *  sample loads begin immediately instead of waiting for the first
   *  triggerAttackRelease — otherwise the first few notes fire into an
   *  unloaded Sampler and play silently. */
  ensureBuilt(): void {
    this._ensureBuilt();
  }

  private _ensureBuilt(): void {
    if (this._synth) return;
    this._synth = buildSynth(this._preset.source);
    this._mixer = new Tone.Gain(1);
    this._synth.connect(this._mixer);
    if (this._preset.layer) {
      this._buildLayer(this._preset.layer);
    }
    // Per-note vibrato + pitch-shift nodes — always present, idle when no
    // event carries the flag. Placed immediately after the mixer so they
    // modulate the dry voice signal before any timbral effects (filter,
    // distortion, chorus) shape it. PitchShift uses granular FFT; quality
    // dialed back via `windowSize` for low CPU.
    this._vibrato = new Tone.Vibrato({ frequency: 5.5, depth: 0 });
    this._pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.05 });
    this._palmMuteFilter = new Tone.Filter({ type: 'lowpass', frequency: 20000, Q: 0.7 });
    this._mixer.connect(this._vibrato);
    this._vibrato.connect(this._pitchShift);
    this._pitchShift.connect(this._palmMuteFilter);
    this._chain = buildChain(this._preset);
    this._exit = wireChain(this._palmMuteFilter, this._chain);
    if (this._autoConnectToMaster) {
      MasterBus.connectVoice(this._exit);
      this._connectedToMaster = true;
    } else if (this._customRoutingTarget) {
      // Multi-track playback path: the manager wired up a per-track Gain
      // before the first play() triggered this build. Connect to it now.
      this._exit.connect(this._customRoutingTarget);
    }
  }

  private _buildLayer(layer: VoiceLayer): void {
    if (!this._mixer) return;
    this._layerSynth = buildSynth(layer.source);
    applyLayerDetune(this._layerSynth, layer.detuneCents);
    this._layerGain = new Tone.Gain(dbToGain(layer.gainDb));
    this._layerSynth.connect(this._layerGain);
    this._layerGain.connect(this._mixer);
  }

  private _disposeLayer(): void {
    this._layerSynth?.dispose();
    this._layerGain?.dispose();
    this._layerSynth = null;
    this._layerGain = null;
  }

  // ─── GuitarInstrument ────────────────────────────────────────────────────────

  play(
    noteName: string,
    duration: string | number,
    audioTime: number,
    options?: {
      velocity?: number;
      vibrato?: 'slight' | 'wide';
      durationSec?: number;
      pitchCurve?: Array<{ at: number; semitones: number }>;
      palmMute?: boolean;
    },
  ): void {
    this._ensureBuilt();
    const synth = this._synth!;
    const velocity = options?.velocity;
    // Audio-thread instrumentation (no-op when window.__FRETWORK_AUDIO_DEBUG
    // is falsy). Track active note count + release-tail estimate so the
    // debug logger can correlate polyphony with audio buffer underruns.
    const durSecForDebug = options?.durationSec ?? (typeof duration === 'number' ? duration : 1);
    const releaseEstimate = this._preset.source.kind === 'sampler' ? (this._preset.source.release ?? 1) : 1;
    noteTriggered(durSecForDebug + releaseEstimate);
    try {
      synth.triggerAttackRelease(noteName, duration, audioTime, velocity);
      // Trigger the body-filter envelope on each note so the cutoff sweeps in
      // sync with the pluck. The envelope's release continues after the synth
      // is silent, which is fine — it only modulates the filter, not the audio.
      this._chain.bodyFilterEnvelope?.triggerAttackRelease(duration, audioTime, velocity);
      // Trigger the layer too, transposed by its octave offset.
      if (this._layerSynth && this._preset.layer) {
        const layerNote = transposeNote(noteName, this._preset.layer.octaveOffset * 12);
        this._layerSynth.triggerAttackRelease(layerNote, duration, audioTime, velocity);
      }
      // Per-note palm-mute. Drop the low-pass filter cutoff to ~600 Hz at
      // note start (instant — palm-mute kicks in immediately) and ramp it
      // back to ~20 kHz (effectively bypassed) right after the note ends.
      // The drop kills the bright pluck transient while the audible
      // duration shortening (done at the scheduler level) gives the chug.
      if (options?.palmMute && options.durationSec != null && this._palmMuteFilter) {
        const dur = Math.max(0.05, options.durationSec);
        const freq = this._palmMuteFilter.frequency;
        freq.cancelScheduledValues(audioTime);
        freq.setValueAtTime(600, audioTime);
        freq.setValueAtTime(600, audioTime + dur);
        // Quick ramp back up after the note so subsequent (non-muted)
        // notes regain their full brightness.
        freq.linearRampToValueAtTime(20000, audioTime + dur + 0.02);
      } else if (this._palmMuteFilter) {
        // Defensively keep the filter open — if a previous palm-mute's
        // ramp hadn't completed when a non-muted note fires, force it.
        this._palmMuteFilter.frequency.cancelScheduledValues(audioTime);
        this._palmMuteFilter.frequency.setValueAtTime(20000, audioTime);
      }
      // Per-note pitch curve (slides + bends share the same mechanism).
      // Tone.PitchShift's `pitch` is a plain JS number property (no Signal
      // API), so we step it manually via setTimeout using audio-clock-
      // relative delays. ~32 Hz step rate is smooth enough for typical
      // durations (200-1500 ms) without burning CPU. Not sample-accurate
      // but well under the audible-jitter threshold for pitch glides.
      if (options?.pitchCurve && options.durationSec != null && this._pitchShift) {
        schedulePitchCurve(
          this._pitchShift,
          audioTime,
          options.durationSec,
          options.pitchCurve,
        );
      }
      // Per-note vibrato. Schedule depth/frequency at the note's start,
      // hold for most of the duration, ramp back to 0 just before release
      // so the next note starts unmodulated. Tone.Vibrato applies pitch
      // wobble via a fractional delay line — works for any source.
      if (options?.vibrato && options.durationSec != null && this._vibrato) {
        const intensity = options.vibrato === 'wide'
          ? { frequency: 4, depth: 0.12 }
          : { frequency: 5.5, depth: 0.04 };
        const start = audioTime;
        const end = audioTime + Math.max(0.05, options.durationSec);
        const attack = Math.min(0.04, options.durationSec * 0.2);
        const release = Math.min(0.05, options.durationSec * 0.2);
        // Cancel any in-flight automations so the next note doesn't inherit
        // depth from a previously-scheduled ramp.
        this._vibrato.depth.cancelScheduledValues(start);
        this._vibrato.frequency.cancelScheduledValues(start);
        this._vibrato.frequency.setValueAtTime(intensity.frequency, start);
        this._vibrato.depth.setValueAtTime(0, start);
        this._vibrato.depth.linearRampToValueAtTime(intensity.depth, start + attack);
        this._vibrato.depth.setValueAtTime(intensity.depth, end - release);
        this._vibrato.depth.linearRampToValueAtTime(0, end);
      }
    } catch {
      // Tone occasionally throws when scheduled too close to the previous trigger.
      // The visual playhead still advances; missing one click is not fatal.
    }
  }

  releaseAll(): void {
    // PluckSynth has natural decay; FMSynth has its own envelope. Nothing to do.
  }

  dispose(): void {
    if (this._connectedToMaster && this._exit) {
      MasterBus.disconnectVoice(this._exit);
      this._connectedToMaster = false;
    }
    this._synth?.dispose();
    this._disposeLayer();
    this._mixer?.dispose();
    this._vibrato?.dispose();
    this._pitchShift?.dispose();
    this._palmMuteFilter?.dispose();
    disposeChain(this._chain);
    this._synth = null;
    this._mixer = null;
    this._vibrato = null;
    this._pitchShift = null;
    this._palmMuteFilter = null;
    this._chain = {};
    this._exit = null;
  }

  // ─── Live tweaks (Sound Lab) ────────────────────────────────────────────────

  /** Update synth parameters in place. Only valid for the current source kind —
   *  switching between e.g. PluckSynth and FMSynth requires constructing a new Voice. */
  updateSynthParams(params: PluckSynthParams | FMSynthParams): void {
    if (!this._synth) {
      this._preset = updatePresetSynthParams(this._preset, params);
      return;
    }
    if (this._preset.source.kind === 'pluck-synth' && this._synth instanceof Tone.PluckSynth) {
      applyPluckSynth(this._synth, params as PluckSynthParams);
    } else if (this._preset.source.kind === 'fm-synth' && this._synth instanceof Tone.FMSynth) {
      applyFMSynth(this._synth, params as FMSynthParams);
    }
    this._preset = updatePresetSynthParams(this._preset, params);
  }

  /** Update the per-voice level (volume + pan) in place. */
  updateLevel(level: VoiceLevel): void {
    this._preset = { ...this._preset, level };
    if (this._chain.volume) this._chain.volume.volume.rampTo(level.volumeDb, 0.02);
    if (this._chain.panner) this._chain.panner.pan.rampTo(level.pan, 0.02);
  }

  /** Update / add / remove the sub-body layer. Source-kind changes (or
   *  add/remove) rebuild the layer; everything else mutates in place. */
  updateLayer(next: VoiceLayer | undefined): void {
    const prev = this._preset.layer;
    this._preset = { ...this._preset, layer: next };
    if (!this._synth || !this._mixer) return;

    const sourceKindChanged = (prev?.source.kind ?? null) !== (next?.source.kind ?? null);
    if (!!prev !== !!next || sourceKindChanged) {
      this._disposeLayer();
      if (next) this._buildLayer(next);
      return;
    }
    if (next && this._layerSynth && this._layerGain) {
      // Same source kind — just update params.
      if (next.source.kind === 'pluck-synth' && this._layerSynth instanceof Tone.PluckSynth) {
        applyPluckSynth(this._layerSynth, next.source.params);
      } else if (next.source.kind === 'fm-synth' && this._layerSynth instanceof Tone.FMSynth) {
        applyFMSynth(this._layerSynth, next.source.params);
      }
      applyLayerDetune(this._layerSynth, next.detuneCents);
      this._layerGain.gain.rampTo(dbToGain(next.gainDb), 0.02);
    }
  }

  /** Update or remove the body filter. Adding/removing the filter (or its
   *  envelope) rebuilds the chain; parameter-only changes mutate in place. */
  updateBodyFilter(next: BodyFilterParams | undefined): void {
    const prev = this._preset.bodyFilter;
    this._preset = { ...this._preset, bodyFilter: next };
    if (!this._synth) return;
    if (!!prev !== !!next || !!prev?.envelope !== !!next?.envelope) {
      this._rebuildChain();
      return;
    }
    if (next && this._chain.bodyFilter) {
      applyBodyFilter(this._chain.bodyFilter, next);
    }
    if (next?.envelope && this._chain.bodyFilterEnvelope) {
      applyBodyFilterEnvelope(this._chain.bodyFilterEnvelope, next.envelope);
    }
  }

  /** Update or remove the compressor. */
  updateCompressor(next: CompressorParams | undefined): void {
    const prev = this._preset.compressor;
    this._preset = { ...this._preset, compressor: next };
    if (!this._synth) return;
    if (!!prev !== !!next) {
      this._rebuildChain();
      return;
    }
    if (next && this._chain.compressor) {
      applyCompressor(this._chain.compressor, next);
    }
  }

  /** Update effects. Same-shape changes mutate in place; add/remove rebuilds. */
  updateEffects(next: EffectsConfig | undefined): void {
    const prev = this._preset.effects;
    this._preset = { ...this._preset, effects: next };
    if (!this._synth) return;
    if (!sameEffectsShape(prev, next)) {
      this._rebuildChain();
      return;
    }
    if (next?.distortion && this._chain.distortion) applyDistortion(this._chain.distortion, next.distortion);
    if (next?.chorus && this._chain.chorus) applyChorus(this._chain.chorus, next.chorus);
    if (next?.delay && this._chain.delay) applyDelay(this._chain.delay, next.delay);
    if (next?.eq && this._chain.eq) applyEQ(this._chain.eq, next.eq);
    if (next?.autoWah && this._chain.autoWah) applyAutoWah(this._chain.autoWah, next.autoWah);
    if (next?.cabIR && this._chain.cabIRMakeup) {
      this._chain.cabIRMakeup.gain.rampTo(dbToGain(next.cabIR.makeupDb ?? 0), 0.02);
    }
  }

  /** Replace the active preset entirely. Same source kind reuses the synth. */
  swapPreset(next: VoicePreset): void {
    if (next.source.kind !== this._preset.source.kind) {
      this.dispose();
      this._preset = next;
      return;
    }
    this.updateSynthParams(extractSynthParams(next.source));
    this.updateLayer(next.layer);
    this.updateLevel(next.level);
    this.updateBodyFilter(next.bodyFilter);
    this.updateCompressor(next.compressor);
    this.updateEffects(next.effects);
    this._preset = next;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _rebuildChain(): void {
    if (
      !this._synth ||
      !this._mixer ||
      !this._exit ||
      !this._vibrato ||
      !this._pitchShift ||
      !this._palmMuteFilter
    )
      return;
    if (this._connectedToMaster) {
      MasterBus.disconnectVoice(this._exit);
      this._connectedToMaster = false;
    }
    this._mixer.disconnect();
    this._vibrato.disconnect();
    this._pitchShift.disconnect();
    this._palmMuteFilter.disconnect();
    disposeChain(this._chain);
    this._mixer.connect(this._vibrato);
    this._vibrato.connect(this._pitchShift);
    this._pitchShift.connect(this._palmMuteFilter);
    this._chain = buildChain(this._preset);
    this._exit = wireChain(this._palmMuteFilter, this._chain);
    if (this._autoConnectToMaster) {
      MasterBus.connectVoice(this._exit);
      this._connectedToMaster = true;
    } else if (this._customRoutingTarget) {
      this._exit.connect(this._customRoutingTarget);
    }
  }

  /**
   * Multi-track playback support: connect this voice's output to a custom
   * downstream node (typically a per-track Gain) rather than going through
   * MasterBus directly. Must be called after `_ensureBuilt` has run (via
   * any prior `play()` call) — for the first play we cache the target so
   * `_ensureBuilt` can wire it on construction.
   */
  setRoutingTarget(target: Tone.ToneAudioNode | null): void {
    this._customRoutingTarget = target;
    if (this._exit) {
      this._exit.disconnect();
      if (target) this._exit.connect(target);
    }
  }
}

// ─── Note transposition + dB helpers ──────────────────────────────────────────

/** Transpose a note name by N semitones via Tone's Frequency utility. */
function transposeNote(note: string, semitones: number): string {
  if (semitones === 0) return note;
  return Tone.Frequency(note).transpose(semitones).toNote();
}

/**
 * Step a Tone.PitchShift node's pitch through an arbitrary `(at, semitones)`
 * curve over `durationSec`. Used by both slides (2- or 3-point curves) and
 * bends (typically 3-4 point curves with intermediate hold regions).
 *
 * The curve points are first sorted by `at`. Between two adjacent points,
 * the pitch interpolates linearly. The resampler hits 32 evenly-spaced
 * positions across the note duration — fine enough for a smooth glide,
 * cheap enough to not strain setTimeout.
 *
 * Pitch resets to 0 right after the note ends so subsequent notes start
 * unshifted (matters especially for bend-release and slide-out which
 * leave the pitch off-zero at the end of the curve).
 */
function schedulePitchCurve(
  pitchShift: Tone.PitchShift,
  audioTime: number,
  durationSec: number,
  rawCurve: Array<{ at: number; semitones: number }>,
): void {
  if (rawCurve.length === 0) return;
  const curve = [...rawCurve].sort((a, b) => a.at - b.at);
  const dur = Math.max(0.05, durationSec);
  const stepCount = 32;
  const nowAudioTime = Tone.getContext().currentTime;
  const baseDelayMs = Math.max(0, (audioTime - nowAudioTime) * 1000);

  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;
    const semitones = sampleCurveAt(curve, t);
    const delayMs = baseDelayMs + dur * t * 1000;
    setTimeout(() => {
      if (!pitchShift.disposed) pitchShift.pitch = semitones;
    }, delayMs);
  }
  setTimeout(() => {
    if (!pitchShift.disposed) pitchShift.pitch = 0;
  }, baseDelayMs + dur * 1000);
}

/**
 * Linear interpolation across a sorted `(at, semitones)` curve. Times before
 * the first point clamp to its value; times after the last clamp to its.
 */
function sampleCurveAt(
  curve: Array<{ at: number; semitones: number }>,
  t: number,
): number {
  if (t <= curve[0].at) return curve[0].semitones;
  if (t >= curve[curve.length - 1].at) return curve[curve.length - 1].semitones;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (t <= b.at) {
      const span = b.at - a.at;
      if (span <= 0) return b.semitones;
      const localT = (t - a.at) / span;
      return a.semitones + (b.semitones - a.semitones) * localT;
    }
  }
  return curve[curve.length - 1].semitones;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Apply detune (in cents) to whichever synth supports it. PluckSynth has no
 *  detune param so the call is a no-op for it. */
function applyLayerDetune(synth: SynthNode, cents: number): void {
  if (synth instanceof Tone.FMSynth) {
    synth.detune.value = cents;
  }
  // PluckSynth — silently ignored.
}

// ─── Build helpers ─────────────────────────────────────────────────────────────

function buildSynth(source: VoiceSource): SynthNode {
  if (source.kind === 'pluck-synth') {
    const { attackNoise, dampening, resonance, release } = source.params;
    return new Tone.PluckSynth({ attackNoise, dampening, resonance, release });
  }
  if (source.kind === 'fm-synth') {
    const p = source.params;
    const synth = new Tone.FMSynth({
      harmonicity: p.harmonicity,
      modulationIndex: p.modulationIndex,
      detune: p.detune,
      oscillator: { type: p.carrierWaveform },
      modulation: { type: p.modulatorWaveform },
      envelope: { ...p.envelope },
      modulationEnvelope: { ...p.modulationEnvelope },
    });
    return synth;
  }
  // Sampler — Tone.Sampler pitch-shifts across a sparse note → URL map (every
  // few semitones is enough). An empty map is meaningless; fall back to a
  // neutral PluckSynth so the voice still makes sound until the user attaches
  // a real sample pack.
  const sampleEntries = Object.keys(source.samples);
  if (sampleEntries.length === 0) {
    return new Tone.PluckSynth({ attackNoise: 0.5, dampening: 4000, resonance: 0.85, release: 0.5 });
  }
  return new Tone.Sampler({
    urls: source.samples,
    release: source.release ?? 1,
  });
}

function buildChain(preset: VoicePreset): ChainNodes {
  const nodes: ChainNodes = {};
  if (preset.bodyFilter) {
    nodes.bodyFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: preset.bodyFilter.cutoff,
      Q: preset.bodyFilter.q,
    });
    if (preset.bodyFilter.envelope) {
      const env = preset.bodyFilter.envelope;
      nodes.bodyFilterEnvelope = new Tone.FrequencyEnvelope({
        attack: env.attack,
        decay: env.decay,
        sustain: env.sustain,
        release: env.release,
        baseFrequency: env.baseFrequency,
        octaves: env.octaves,
      });
      nodes.bodyFilterEnvelope.connect(nodes.bodyFilter.frequency);
    }
  }
  if (preset.compressor) {
    nodes.compressor = new Tone.Compressor({
      threshold: preset.compressor.threshold,
      ratio: preset.compressor.ratio,
      attack: preset.compressor.attack,
      release: preset.compressor.release,
      knee: preset.compressor.knee,
    });
  }
  if (preset.effects?.distortion) {
    nodes.distortion = new Tone.Distortion({
      distortion: preset.effects.distortion.drive,
      wet: preset.effects.distortion.wet,
      oversample: preset.effects.distortion.oversample,
    });
  }
  if (preset.effects?.chorus) {
    nodes.chorus = new Tone.Chorus({
      frequency: preset.effects.chorus.frequency,
      depth: preset.effects.chorus.depth,
      wet: preset.effects.chorus.wet,
      type: preset.effects.chorus.type,
      feedback: preset.effects.chorus.feedback,
      delayTime: preset.effects.chorus.delayTime * 1000, // Tone Chorus delayTime is ms
      spread: preset.effects.chorus.spread,
    });
    nodes.chorus.start();
  }
  if (preset.effects?.delay) {
    nodes.delay = new Tone.FeedbackDelay({
      delayTime: preset.effects.delay.delayTime,
      feedback: preset.effects.delay.feedback,
      wet: preset.effects.delay.wet,
    });
  }
  if (preset.effects?.eq) {
    nodes.eq = new Tone.EQ3({
      low: preset.effects.eq.low,
      mid: preset.effects.eq.mid,
      high: preset.effects.eq.high,
      lowFrequency: preset.effects.eq.lowFrequency,
      highFrequency: preset.effects.eq.highFrequency,
    });
  }
  if (preset.effects?.autoWah) {
    nodes.autoWah = new Tone.AutoWah({
      baseFrequency: preset.effects.autoWah.baseFrequency,
      octaves: preset.effects.autoWah.octaves,
      sensitivity: preset.effects.autoWah.sensitivity,
      Q: preset.effects.autoWah.q,
      gain: preset.effects.autoWah.gain,
      wet: preset.effects.autoWah.wet,
    });
  }
  if (preset.effects?.cabIR) {
    // `normalize: false` applies the IR at its native level. Tone's default
    // normalize divides by the IR's RMS, which sounds drastically quieter
    // for cab IRs (which attenuate high-end). The IR packs we ship are
    // recorded for unnormalized use; per-IR variance is handled by the
    // separate `makeupDb` gain immediately after.
    nodes.cabIR = new Tone.Convolver({
      url: preset.effects.cabIR.url,
      normalize: false,
    });
    nodes.cabIRMakeup = new Tone.Gain(dbToGain(preset.effects.cabIR.makeupDb ?? 0));
  }
  // Always present: volume + pan at the end of the chain.
  nodes.volume = new Tone.Volume(preset.level.volumeDb);
  nodes.panner = new Tone.Panner(preset.level.pan);
  return nodes;
}

/** Connect entry node → chain in fixed order. Returns the chain's exit node.
 *  `entry` is the mixer (which receives the primary synth + optional layer). */
function wireChain(
  entry: Tone.ToneAudioNode,
  c: ChainNodes,
): Tone.ToneAudioNode {
  const order: Tone.ToneAudioNode[] = [entry];
  if (c.bodyFilter) order.push(c.bodyFilter);
  if (c.compressor) order.push(c.compressor);
  if (c.distortion) order.push(c.distortion);
  if (c.chorus) order.push(c.chorus);
  if (c.delay) order.push(c.delay);
  if (c.eq) order.push(c.eq);
  if (c.autoWah) order.push(c.autoWah);
  if (c.cabIR) order.push(c.cabIR);
  if (c.cabIRMakeup) order.push(c.cabIRMakeup);
  if (c.volume) order.push(c.volume);
  if (c.panner) order.push(c.panner);
  for (let i = 0; i < order.length - 1; i++) {
    order[i].connect(order[i + 1]);
  }
  return order[order.length - 1];
}

function disposeChain(c: ChainNodes): void {
  c.bodyFilterEnvelope?.dispose();
  c.bodyFilter?.dispose();
  c.compressor?.dispose();
  c.distortion?.dispose();
  c.chorus?.dispose();
  c.delay?.dispose();
  c.eq?.dispose();
  c.autoWah?.dispose();
  c.cabIR?.dispose();
  c.cabIRMakeup?.dispose();
  c.volume?.dispose();
  c.panner?.dispose();
}

// ─── Apply helpers (in-place mutation) ─────────────────────────────────────────

function applyPluckSynth(node: Tone.PluckSynth, p: PluckSynthParams): void {
  node.attackNoise = p.attackNoise;
  node.dampening = p.dampening;
  node.resonance = p.resonance;
  node.release = p.release;
}

function applyFMSynth(node: Tone.FMSynth, p: FMSynthParams): void {
  node.harmonicity.value = p.harmonicity;
  node.modulationIndex.value = p.modulationIndex;
  node.detune.value = p.detune;
  setOscillatorType(node.oscillator as unknown as { type: string }, p.carrierWaveform);
  setOscillatorType(node.modulation as unknown as { type: string }, p.modulatorWaveform);
  applyEnvelope(node.envelope as unknown as { attack: number; decay: number; sustain: number; release: number }, p.envelope);
  applyEnvelope(node.modulationEnvelope as unknown as { attack: number; decay: number; sustain: number; release: number }, p.modulationEnvelope);
}

function setOscillatorType(osc: { type: string }, type: OscillatorType): void {
  osc.type = type;
}

function applyEnvelope(
  env: { attack: number; decay: number; sustain: number; release: number },
  p: ADSREnvelope,
): void {
  env.attack = p.attack;
  env.decay = p.decay;
  env.sustain = p.sustain;
  env.release = p.release;
}

function applyBodyFilter(node: Tone.Filter, p: BodyFilterParams): void {
  // When an envelope is driving the cutoff, the static cutoff is ignored — the
  // envelope sets the value at each trigger. Skip the static ramp in that case.
  if (!p.envelope) node.frequency.rampTo(p.cutoff, 0.02);
  node.Q.rampTo(p.q, 0.02);
}

function applyBodyFilterEnvelope(node: Tone.FrequencyEnvelope, p: BodyFilterEnvelope): void {
  node.attack = p.attack;
  node.decay = p.decay;
  node.sustain = p.sustain;
  node.release = p.release;
  node.baseFrequency = p.baseFrequency;
  node.octaves = p.octaves;
}

function applyAutoWah(node: Tone.AutoWah, p: AutoWahParams): void {
  node.baseFrequency = p.baseFrequency;
  node.octaves = p.octaves;
  node.sensitivity = p.sensitivity;
  node.Q.rampTo(p.q, 0.02);
  node.gain.rampTo(p.gain, 0.02);
  node.wet.rampTo(p.wet, 0.02);
}

function applyCompressor(node: Tone.Compressor, p: CompressorParams): void {
  node.threshold.rampTo(p.threshold, 0.02);
  node.ratio.rampTo(p.ratio, 0.02);
  node.attack.rampTo(p.attack, 0.02);
  node.release.rampTo(p.release, 0.02);
  node.knee.rampTo(p.knee, 0.02);
}

function applyDistortion(node: Tone.Distortion, p: DistortionParams): void {
  node.distortion = p.drive;
  node.oversample = p.oversample;
  node.wet.rampTo(p.wet, 0.02);
}

function applyChorus(node: Tone.Chorus, p: ChorusParams): void {
  node.frequency.value = p.frequency;
  node.depth = p.depth;
  setChorusType(node, p.type);
  node.feedback.rampTo(p.feedback, 0.02);
  node.delayTime = p.delayTime * 1000; // ms
  node.spread = p.spread;
  node.wet.rampTo(p.wet, 0.02);
}

function setChorusType(node: Tone.Chorus, type: ChorusType): void {
  // Tone exposes the LFO type via `.type` on Chorus.
  (node as unknown as { type: string }).type = type;
}

function applyDelay(node: Tone.FeedbackDelay, p: DelayParams): void {
  node.delayTime.rampTo(p.delayTime, 0.02);
  node.feedback.rampTo(p.feedback, 0.02);
  node.wet.rampTo(p.wet, 0.02);
}

function applyEQ(node: Tone.EQ3, p: EQParams): void {
  node.low.rampTo(p.low, 0.02);
  node.mid.rampTo(p.mid, 0.02);
  node.high.rampTo(p.high, 0.02);
  node.lowFrequency.rampTo(p.lowFrequency, 0.02);
  node.highFrequency.rampTo(p.highFrequency, 0.02);
}

function sameEffectsShape(a: EffectsConfig | undefined, b: EffectsConfig | undefined): boolean {
  return (
    !!a?.distortion === !!b?.distortion &&
    !!a?.chorus === !!b?.chorus &&
    !!a?.delay === !!b?.delay &&
    !!a?.eq === !!b?.eq &&
    !!a?.autoWah === !!b?.autoWah &&
    !!a?.cabIR === !!b?.cabIR &&
    // URL change also requires a rebuild — Tone.Convolver loads its IR in
    // the constructor and doesn't support swapping URLs in place. Makeup
    // gain changes go through the in-place path below.
    a?.cabIR?.url === b?.cabIR?.url
  );
}

function extractSynthParams(source: VoiceSource): PluckSynthParams | FMSynthParams {
  if (source.kind === 'pluck-synth') return source.params;
  if (source.kind === 'fm-synth') return source.params;
  return { attackNoise: 0.5, dampening: 4000, resonance: 0.85, release: 0.5 };
}

function updatePresetSynthParams(
  preset: VoicePreset,
  params: PluckSynthParams | FMSynthParams,
): VoicePreset {
  if (preset.source.kind === 'pluck-synth') {
    return { ...preset, source: { kind: 'pluck-synth', params: params as PluckSynthParams } };
  }
  if (preset.source.kind === 'fm-synth') {
    return { ...preset, source: { kind: 'fm-synth', params: params as FMSynthParams } };
  }
  return preset;
}
