/**
 * Voice — a configurable `GuitarInstrument` built from a `VoicePreset`.
 *
 * Signal chain (top of file):
 *
 *   synth ─► [bodyFilter] ─► [compressor] ─► [distortion] ─► [chorus] ─►
 *                                                  [delay] ─► [eq] ─► volume ─► pan ─► output
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
  private _chain: ChainNodes = {};
  private _exit: Tone.ToneAudioNode | null = null;
  private _connectedToMaster = false;

  constructor(preset: VoicePreset) {
    this._preset = preset;
  }

  get preset(): VoicePreset {
    return this._preset;
  }

  get output(): Tone.ToneAudioNode | undefined {
    return this._exit ?? undefined;
  }

  // ─── Build / tear down ───────────────────────────────────────────────────────

  private _ensureBuilt(): void {
    if (this._synth) return;
    this._synth = buildSynth(this._preset.source);
    this._mixer = new Tone.Gain(1);
    this._synth.connect(this._mixer);
    if (this._preset.layer) {
      this._buildLayer(this._preset.layer);
    }
    this._chain = buildChain(this._preset);
    this._exit = wireChain(this._mixer, this._chain);
    MasterBus.connectVoice(this._exit);
    this._connectedToMaster = true;
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

  play(noteName: string, duration: string | number, audioTime: number): void {
    this._ensureBuilt();
    const synth = this._synth!;
    try {
      synth.triggerAttackRelease(noteName, duration, audioTime);
      // Trigger the body-filter envelope on each note so the cutoff sweeps in
      // sync with the pluck. The envelope's release continues after the synth
      // is silent, which is fine — it only modulates the filter, not the audio.
      this._chain.bodyFilterEnvelope?.triggerAttackRelease(duration, audioTime);
      // Trigger the layer too, transposed by its octave offset.
      if (this._layerSynth && this._preset.layer) {
        const layerNote = transposeNote(noteName, this._preset.layer.octaveOffset * 12);
        this._layerSynth.triggerAttackRelease(layerNote, duration, audioTime);
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
    disposeChain(this._chain);
    this._synth = null;
    this._mixer = null;
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
    if (!this._synth || !this._mixer || !this._exit) return;
    if (this._connectedToMaster) {
      MasterBus.disconnectVoice(this._exit);
      this._connectedToMaster = false;
    }
    this._mixer.disconnect();
    disposeChain(this._chain);
    this._chain = buildChain(this._preset);
    this._exit = wireChain(this._mixer, this._chain);
    MasterBus.connectVoice(this._exit);
    this._connectedToMaster = true;
  }
}

// ─── Note transposition + dB helpers ──────────────────────────────────────────

/** Transpose a note name by N semitones via Tone's Frequency utility. */
function transposeNote(note: string, semitones: number): string {
  if (semitones === 0) return note;
  return Tone.Frequency(note).transpose(semitones).toNote();
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
    !!a?.autoWah === !!b?.autoWah
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
