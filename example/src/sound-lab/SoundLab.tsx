/**
 * Sound Lab — a developer-facing tuning surface for the playback voices.
 *
 * Surfaces every control that the underlying voice + master bus expose. Pick a
 * preset, tweak any parameter live, audition with the buttons, and copy the
 * resulting JSON when the sound is right. Eventually this same surface (or a
 * subset) may ship to end users so they can save personal tones.
 *
 * Reach this page via `?lab=1` (handled in `main.tsx`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Switch,
  Label,
  Voice,
  MasterBus,
  DEFAULT_REVERB_SETTINGS,
  startAudio,
  resolveActiveVoice,
  useVoiceStore,
  type FretInstrumentId,
  type AutoWahParams,
  type BodyFilterEnvelope,
  type BodyFilterParams,
  type ChorusParams,
  type ChorusType,
  type CompressorParams,
  type DelayParams,
  type DistortionParams,
  type DistortionOversample,
  type AmpParams,
  type CabIRParams,
  AMP_MODELS,
  getAmpModel,
  DEFAULT_AMP_MODEL_ID,
  type VoiceReverbParams,
  type GraphicEqParams,
  type EQParams,
  type EffectsConfig,
  type FMSynthParams,
  type OscillatorType,
  type PluckSynthParams,
  type ReverbSettings,
  type VoiceLayer,
  type VoiceLevel,
  type VoicePreset,
  type VoiceSource,
  SAMPLE_PACKS,
  detectSamplePack,
  CABINET_IRS,
  detectCabinetIR,
} from '@fretwork/lib';
import { ParameterSlider } from './ParameterSlider';
import { AuditionDeck } from './AuditionDeck';
import { Link } from '../router';
import { VoicePickerChip } from '../voices/VoicePickerChip';
import { SaveAsVariantDialog } from '../voices/SaveAsVariantDialog';
import { Knob } from '../components/ui/Knob';
import { VerticalSlider } from '../components/ui/VerticalSlider';
import { AmpPanel } from '../components/sound-design/AmpPanel';
import { Cabinet } from '../components/sound-design/Cabinet';
import { RackUnit } from '../components/sound-design/RackUnit';
import { ViewModeProvider, ViewToggle, useViewMode } from '../components/sound-design/view-mode';

const OSCILLATOR_TYPES: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const CHORUS_TYPES: ChorusType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const OVERSAMPLE_OPTIONS: DistortionOversample[] = ['none', '2x', '4x'];

const INSTRUMENT_TABS: readonly FretInstrumentId[] = ['guitar', 'bass', 'ukulele'];

export function SoundLab() {
  // ─── Lab-local state ──────────────────────────────────────────────────────
  // The active variant for the current instrument lives in `useVoiceStore`; the
  // lab subscribes to it so changing the active variant elsewhere (or via the
  // chip) updates what we're editing here. Slider edits land in `pendingPreset`
  // (ephemeral) and require an explicit Save to persist.
  const [labInstrumentId, setLabInstrumentId] = useState<FretInstrumentId>('guitar');
  const activeRef = useVoiceStore((s) => s.activeVariants[labInstrumentId]);
  const variants = useVoiceStore((s) => s.variants);
  const updateVariant = useVoiceStore((s) => s.updateVariant);
  const storedReverb = useVoiceStore((s) => s.reverb);
  const setReverbInStore = useVoiceStore((s) => s.setReverb);

  const baseVariantPreset = useMemo(
    () => resolveActiveVoice(labInstrumentId),
    // Track the bits of store state that change the resolved preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labInstrumentId, activeRef, variants],
  );

  const [pendingPreset, setPendingPreset] = useState<VoicePreset>(baseVariantPreset);
  const [pendingReverb, setPendingReverb] = useState<ReverbSettings>(
    storedReverb ?? DEFAULT_REVERB_SETTINGS,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [testNote, setTestNote] = useState<string>('A3');
  const [copied, setCopied] = useState(false);

  // When the active variant changes (or instrument tab switches), drop unsaved
  // edits and snap to the new variant's preset.
  useEffect(() => {
    setPendingPreset(baseVariantPreset);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labInstrumentId, activeRef.kind === 'user' ? activeRef.id : activeRef.slotId]);

  // Reverb is global — keep pendingReverb in sync with the store when not
  // dirty (the lab can still tweak reverb sliders; saved on next Save).
  useEffect(() => {
    if (!isDirty) {
      setPendingReverb(storedReverb ?? DEFAULT_REVERB_SETTINGS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedReverb]);

  // Warn before leaving with unsaved changes (full-page nav).
  useEffect(() => {
    if (!isDirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [isDirty]);

  const isActiveDefault = activeRef.kind === 'default';
  const activeUserVariant = activeRef.kind === 'user' ? variants.find((v) => v.id === activeRef.id) ?? null : null;

  // ─── Voice audition + master bus ─────────────────────────────────────────
  const [voice, setVoice] = useState<Voice | null>(null);

  // Identity for sampler-source rebuilds: the samples-array reference is
  // stable per registered SAMPLE_PACK entry, so this changes iff the user
  // picks a different pack. Tracked separately from `source.kind` because
  // switching packs WITHIN sampler kind doesn't change kind. Synth-kind
  // changes are handled by the mirror effect below via updateSynthParams.
  const samplerSamples = pendingPreset.source.kind === 'sampler'
    ? pendingPreset.source.samples
    : null;

  useEffect(() => {
    const v = new Voice(pendingPreset);
    // Eager build: constructs the audio chain immediately so any sampler banks
    // start loading on voice mount rather than waiting for first play. Pairs
    // with the cab-IR-first-note-silent fix from 2026-05-25.
    v.ensureBuilt();
    setVoice(v);
    return () => {
      v.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labInstrumentId, pendingPreset.source.kind, samplerSamples]);

  useEffect(() => {
    if (!voice) return;
    if (pendingPreset.source.kind === 'pluck-synth' || pendingPreset.source.kind === 'fm-synth') {
      voice.updateSynthParams(pendingPreset.source.params);
    }
    voice.updateLayer(pendingPreset.layer);
    voice.updateInputGain(pendingPreset.inputGainDb);
    voice.updateLevel(pendingPreset.level);
    voice.updateBodyFilter(pendingPreset.bodyFilter);
    voice.updateCompressor(pendingPreset.compressor);
    voice.updateEffects(pendingPreset.effects);
  }, [voice, pendingPreset]);

  useEffect(() => {
    MasterBus.setReverbSettings(pendingReverb);
  }, [pendingReverb]);

  // First-gesture warmup. Browser autoplay policy requires a user gesture before
  // we can resume the AudioContext.
  useEffect(() => {
    let warmed = false;
    const onFirstGesture = async () => {
      if (warmed) return;
      warmed = true;
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
      try {
        await startAudio();
        await MasterBus.warmup();
      } catch {
        // Best-effort warmup.
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, true);
    window.addEventListener('keydown', onFirstGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
    };
  }, []);

  // ─── Edit helpers ────────────────────────────────────────────────────────
  const updateActive = (patch: (p: VoicePreset) => VoicePreset) => {
    setPendingPreset((prev) => patch(prev));
    setIsDirty(true);
  };

  const updateReverb = (next: ReverbSettings | ((r: ReverbSettings) => ReverbSettings)) => {
    setPendingReverb((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      // Reverb is global (MasterBus, shared across voices) — persist to the
      // store immediately rather than waiting for a variant Save. Doesn't
      // touch isDirty because it isn't part of the per-voice preset.
      setReverbInStore(resolved);
      return resolved;
    });
  };

  const onSave = () => {
    if (isActiveDefault || !activeUserVariant) return;
    updateVariant(activeUserVariant.id, { preset: pendingPreset, name: pendingPreset.name });
    setIsDirty(false);
  };

  const confirmDiscardIfDirty = () => {
    if (!isDirty) return true;
    return window.confirm(`Discard unsaved edits to "${pendingPreset.name}"?`);
  };

  // Per-variant export payload. Reverb is intentionally excluded — it's a
  // global setting, not part of any individual variant, so it shouldn't
  // travel with copy/paste workflows (back-up, share, paste-into-presets.ts).
  const variantJson = useMemo(
    () => JSON.stringify(pendingPreset, null, 2),
    [pendingPreset],
  );

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(variantJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail under insecure contexts; silent fallback.
    }
  };

  return (
    <ViewModeProvider>
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-charcoal-raised/70 backdrop-blur px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">Sound Lab</h1>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Tune voice variants · /?lab=1
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle />
          <Link to={{ kind: 'home' }} className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Variant picker + actions */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
          {/* Instrument tab strip */}
          <div className="flex items-center gap-1">
            {INSTRUMENT_TABS.map((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => {
                  if (!confirmDiscardIfDirty()) return;
                  setLabInstrumentId(inst);
                }}
                className={
                  'h-8 px-3 rounded-md text-xs font-mono uppercase tracking-wider border transition-colors ' +
                  (labInstrumentId === inst
                    ? 'border-input bg-card text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground')
                }
              >
                {inst}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
                Voice
              </Label>
              <VoicePickerChip
                instrumentId={labInstrumentId}
                allowMutations
                onBeforePick={confirmDiscardIfDirty}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                {pendingPreset.instrumentId} · {pendingPreset.family}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <SaveStatusPill status={isDirty ? 'pending' : 'idle'} />
              <Button
                size="sm"
                variant="default"
                onClick={onSave}
                disabled={isActiveDefault || !isDirty}
              >
                Save
              </Button>
              <Button size="sm" variant="default" onClick={() => setSaveAsOpen(true)}>
                Save as new variant…
              </Button>
            </div>
          </div>

          {isActiveDefault && (
            <p className="text-[11px] font-mono text-amber-400/90 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1.5">
              Defaults are read-only. Use <span className="font-bold">Save as new variant</span> to keep your tweaks.
            </p>
          )}

          <AuditionDeck voice={voice} testNote={testNote} setTestNote={setTestNote} />
        </section>

        {/* Synth parameters */}
        <Section title="Synth">
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
              Type
            </Label>
            <select
              value={pendingPreset.source.kind}
              onChange={(e) => {
                const next = e.target.value as 'pluck-synth' | 'fm-synth' | 'sampler';
                if (next === pendingPreset.source.kind) return;
                updateActive((p) => ({ ...p, source: defaultSourceForKind(next) }));
              }}
              className="h-9 px-2.5 bg-card border border-input rounded-md text-foreground text-xs font-mono"
            >
              <option value="pluck-synth">PluckSynth (Karplus-Strong)</option>
              <option value="fm-synth">FMSynth</option>
              <option value="sampler">Sampler</option>
            </select>
          </div>
          {pendingPreset.source.kind === 'pluck-synth' && (
            <PluckSynthControls
              params={pendingPreset.source.params}
              onChange={(params) =>
                updateActive((p) => ({ ...p, source: { kind: 'pluck-synth', params } }))
              }
            />
          )}
          {pendingPreset.source.kind === 'fm-synth' && (
            <FMSynthControls
              params={pendingPreset.source.params}
              onChange={(params) =>
                updateActive((p) => ({ ...p, source: { kind: 'fm-synth', params } }))
              }
            />
          )}
          {pendingPreset.source.kind === 'sampler' && (
            <SamplerControls
              samples={pendingPreset.source.samples}
              release={pendingPreset.source.release}
              onChange={(samples, release) =>
                updateActive((p) => ({ ...p, source: { kind: 'sampler', samples, release } }))
              }
            />
          )}
        </Section>

        {/* Sub-body layer (optional second synth mixed underneath) */}
        <Section title="Sub-body layer">
          <ToggleableBlock
            enabled={!!pendingPreset.layer}
            onToggle={(on) =>
              updateActive((p) => ({
                ...p,
                layer: on ? defaultLayerForKind(p.source.kind) : undefined,
              }))
            }
            label="Layer on"
          >
            {pendingPreset.layer && (
              <LayerControls
                layer={pendingPreset.layer}
                onChange={(layer) => updateActive((p) => ({ ...p, layer }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        {/* Effects rack — body filter (pre-pre-amp lowpass) leads, then
            compressor, pedalboard, graphic EQ, amp, post-amp, voice level,
            master reverb at the end. Order matches signal flow top to bottom. */}
        <Section title="Effects">
          <EffectControls
            effects={pendingPreset.effects ?? {}}
            onChange={(effects) => updateActive((p) => ({ ...p, effects }))}
            compressor={pendingPreset.compressor}
            onCompressorChange={(compressor) => updateActive((p) => ({ ...p, compressor }))}
            bodyFilter={pendingPreset.bodyFilter}
            onBodyFilterChange={(bodyFilter) => updateActive((p) => ({ ...p, bodyFilter }))}
            inputGainDb={pendingPreset.inputGainDb}
            onInputGainChange={(inputGainDb) => updateActive((p) => ({ ...p, inputGainDb }))}
            level={pendingPreset.level}
            onLevelChange={(level) => updateActive((p) => ({ ...p, level }))}
            masterReverb={pendingReverb}
            onMasterReverbChange={(r) => updateReverb(r)}
            voice={voice}
          />
        </Section>

        {/* Variant JSON readout — copy/paste payload for backing up or
            promoting a tuning into presets.ts. Reverb is global and excluded. */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
                Variant JSON
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground/60">
                Copy to back up the active voice or paste into <code>presets.ts</code> to ship as a baseline.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={copyJson}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
          <pre className="text-[11px] font-mono leading-relaxed bg-charcoal-deep/60 border border-border/30 rounded p-3 overflow-x-auto max-h-[420px]">
            {variantJson}
          </pre>
        </section>
      </main>

      {saveAsOpen && (
        <SaveAsVariantDialog
          instrumentId={labInstrumentId}
          seedPreset={pendingPreset}
          onClose={() => setSaveAsOpen(false)}
          onSaved={() => setIsDirty(false)}
        />
      )}
    </div>
    </ViewModeProvider>
  );
}

// ─── Section + helpers ────────────────────────────────────────────────────────

function SaveStatusPill({ status }: { status: 'idle' | 'pending' | 'saved' }) {
  const text =
    status === 'pending' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Saved';
  const tone =
    status === 'pending'
      ? 'text-muted-foreground/70'
      : status === 'saved'
        ? 'text-degree-fifth'
        : 'text-muted-foreground/50';
  return (
    <span
      aria-live="polite"
      className={`text-[10px] font-mono uppercase tracking-wider px-2 ${tone}`}
    >
      {text}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
      <h2 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ToggleableBlock({
  enabled,
  onToggle,
  label,
  children,
}: {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <Label className="cursor-pointer text-xs">{label}</Label>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {children}
    </>
  );
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-24 font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="flex-1 h-8 px-2 rounded-md bg-card border border-input font-mono text-xs"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── Synth controls ───────────────────────────────────────────────────────────

function PluckSynthControls({
  params,
  onChange,
}: {
  params: PluckSynthParams;
  onChange: (next: PluckSynthParams) => void;
}) {
  const set = (patch: Partial<PluckSynthParams>) => onChange({ ...params, ...patch });
  return (
    <>
      <ParameterSlider label="Attack noise" value={params.attackNoise} min={0} max={1} step={0.01} onChange={(attackNoise) => set({ attackNoise })} />
      <ParameterSlider label="Dampening" value={params.dampening} min={500} max={8000} step={50} unit="Hz" precision={0} onChange={(dampening) => set({ dampening })} />
      <ParameterSlider label="Resonance" value={params.resonance} min={0} max={1} step={0.01} onChange={(resonance) => set({ resonance })} />
      <ParameterSlider label="Release" value={params.release} min={0.05} max={3} step={0.05} unit="s" onChange={(release) => set({ release })} />
    </>
  );
}

function FMSynthControls({
  params,
  onChange,
}: {
  params: FMSynthParams;
  onChange: (next: FMSynthParams) => void;
}) {
  const set = (patch: Partial<FMSynthParams>) => onChange({ ...params, ...patch });
  return (
    <>
      <ParameterSlider label="Harmonicity" value={params.harmonicity} min={0.25} max={4} step={0.05} onChange={(harmonicity) => set({ harmonicity })} />
      <ParameterSlider label="Mod index" value={params.modulationIndex} min={0} max={20} step={0.1} precision={1} onChange={(modulationIndex) => set({ modulationIndex })} />
      <ParameterSlider label="Detune" value={params.detune} min={-50} max={50} step={1} unit="ct" precision={0} onChange={(detune) => set({ detune })} />
      <SelectRow label="Carrier" value={params.carrierWaveform} options={OSCILLATOR_TYPES} onChange={(carrierWaveform) => set({ carrierWaveform })} />
      <SelectRow label="Modulator" value={params.modulatorWaveform} options={OSCILLATOR_TYPES} onChange={(modulatorWaveform) => set({ modulatorWaveform })} />

      <h4 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60 pt-2">
        Amplitude envelope
      </h4>
      <ParameterSlider label="Attack" value={params.envelope.attack} min={0.001} max={1} step={0.005} unit="s" precision={3} onChange={(attack) => set({ envelope: { ...params.envelope, attack } })} />
      <ParameterSlider label="Decay" value={params.envelope.decay} min={0.01} max={2} step={0.01} unit="s" onChange={(decay) => set({ envelope: { ...params.envelope, decay } })} />
      <ParameterSlider label="Sustain" value={params.envelope.sustain} min={0} max={1} step={0.01} onChange={(sustain) => set({ envelope: { ...params.envelope, sustain } })} />
      <ParameterSlider label="Release" value={params.envelope.release} min={0.05} max={4} step={0.05} unit="s" onChange={(release) => set({ envelope: { ...params.envelope, release } })} />

      <h4 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60 pt-2">
        Modulation envelope
      </h4>
      <ParameterSlider label="Attack" value={params.modulationEnvelope.attack} min={0.001} max={1} step={0.005} unit="s" precision={3} onChange={(attack) => set({ modulationEnvelope: { ...params.modulationEnvelope, attack } })} />
      <ParameterSlider label="Decay" value={params.modulationEnvelope.decay} min={0.01} max={2} step={0.01} unit="s" onChange={(decay) => set({ modulationEnvelope: { ...params.modulationEnvelope, decay } })} />
      <ParameterSlider label="Sustain" value={params.modulationEnvelope.sustain} min={0} max={1} step={0.01} onChange={(sustain) => set({ modulationEnvelope: { ...params.modulationEnvelope, sustain } })} />
      <ParameterSlider label="Release" value={params.modulationEnvelope.release} min={0.05} max={4} step={0.05} unit="s" onChange={(release) => set({ modulationEnvelope: { ...params.modulationEnvelope, release } })} />
    </>
  );
}

// ─── Sampler controls ─────────────────────────────────────────────────────────

function SamplerControls({
  samples,
  release,
  onChange,
}: {
  samples: ReadonlyArray<Readonly<Record<string, string>>>;
  release: number | undefined;
  onChange: (samples: ReadonlyArray<Record<string, string>>, release: number) => void;
}) {
  const matchedPack = useMemo(() => detectSamplePack(samples), [samples]);
  const bank0 = samples[0] ?? {};
  const sampleCount = Object.keys(bank0).length;
  const bankCount = samples.length;
  const effectiveRelease = release ?? 1;
  const [customOpen, setCustomOpen] = useState(false);
  const [customJson, setCustomJson] = useState(() => JSON.stringify(bank0, null, 2));
  const [customError, setCustomError] = useState<string | null>(null);

  const onPickPack = (packId: string) => {
    const pack = SAMPLE_PACKS.find((p: { id: string }) => p.id === packId);
    if (!pack) return;
    onChange(pack.samples.map((b) => ({ ...b })), effectiveRelease);
    setCustomJson(JSON.stringify(pack.samples[0] ?? {}, null, 2));
    setCustomError(null);
  };

  const applyCustom = () => {
    try {
      const parsed = JSON.parse(customJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object of { note: url } pairs');
      }
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') {
          throw new Error(`Value for "${k}" must be a string URL`);
        }
        out[k] = v;
      }
      // Custom JSON edits a single bank — emit a single-bank array. Drops any
      // existing multi-bank rotation back to single-take.
      onChange([out], effectiveRelease);
      setCustomError(null);
      setCustomOpen(false);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
          Pack
        </Label>
        <select
          value={matchedPack?.id ?? ''}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setCustomJson(JSON.stringify(bank0, null, 2));
              setCustomOpen(true);
              return;
            }
            onPickPack(e.target.value);
          }}
          className="h-9 px-2.5 bg-card border border-input rounded-md text-foreground text-xs font-mono"
        >
          {!matchedPack && <option value="">Custom ({sampleCount} samples)</option>}
          {SAMPLE_PACKS.map((p: { id: string; label: string }) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">Edit JSON…</option>
        </select>
      </div>
      {matchedPack && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed mb-2">
          {matchedPack.description}
        </p>
      )}
      <ParameterSlider
        label="Release"
        value={effectiveRelease}
        min={0.1}
        max={4}
        step={0.1}
        unit="s"
        onChange={(r) => onChange(samples.map((b) => ({ ...b })), r)}
      />
      <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed pt-2">
        {sampleCount === 0
          ? 'No samples — voice falls back to a neutral PluckSynth at play time. Pick a pack above to attach samples.'
          : bankCount > 1
            ? `${sampleCount} samples × ${bankCount} round-robin takes · Voice rotates per pitch to humanize repeated notes. First play may lag slightly while all banks decode.`
            : `${sampleCount} samples mapped · Tone.Sampler pitch-shifts between them. First note may lag slightly on cold load while samples decode.`}
      </p>
      {customOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded border border-border/60 bg-charcoal-deep/40 p-3">
          <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
            Custom sample map (JSON)
          </Label>
          {bankCount > 1 && (
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              This pack ships {bankCount} round-robin takes. Editing the JSON drops to single-bank mode (no rotation).
            </p>
          )}
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            rows={10}
            className="w-full px-2 py-1.5 text-[11px] font-mono leading-relaxed rounded border border-input bg-charcoal-deep/60 text-foreground"
            placeholder={'{\n  "A2": "/samples/my-guitar/A2.mp3",\n  "C3": "/samples/my-guitar/C3.mp3"\n}'}
          />
          {customError && (
            <p className="text-[11px] text-red-300">{customError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setCustomOpen(false); setCustomError(null); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyCustom}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Source kind defaults ─────────────────────────────────────────────────────

/** Sensible-default `VoiceSource` for each kind, used when the user switches
 *  the synth type in the Lab. PluckSynth and FMSynth get middle-of-the-road
 *  values; Sampler starts with no samples (it's a stub until the SamplerInstrument
 *  ships — falls back to PluckSynth at play time). */
function defaultSourceForKind(kind: VoiceSource['kind']): VoiceSource {
  switch (kind) {
    case 'pluck-synth':
      return {
        kind: 'pluck-synth',
        params: { attackNoise: 1.0, dampening: 5000, resonance: 0.9, release: 1.5 },
      };
    case 'fm-synth':
      return {
        kind: 'fm-synth',
        params: {
          harmonicity: 2,
          modulationIndex: 4,
          detune: 0,
          carrierWaveform: 'triangle',
          modulatorWaveform: 'sine',
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.7 },
          modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.6 },
        },
      };
    case 'sampler':
      return { kind: 'sampler', samples: [{}], release: 1 };
  }
}

// ─── Sub-body layer ───────────────────────────────────────────────────────────

const LAYER_SOURCE_KINDS: Array<'pluck-synth' | 'fm-synth'> = ['fm-synth', 'pluck-synth'];

function defaultLayerForKind(_kind: VoiceSource['kind']): VoiceLayer {
  // Default layer is a quiet sine FM body one octave down — a useful starting
  // point for most voices regardless of the primary's source kind.
  return {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 0.5,
        modulationIndex: 2,
        detune: 0,
        carrierWaveform: 'sine',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.8 },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.7 },
      },
    },
    gainDb: -10,
    octaveOffset: -1,
    detuneCents: 0,
  };
}

function LayerControls({
  layer,
  onChange,
}: {
  layer: VoiceLayer;
  onChange: (next: VoiceLayer) => void;
}) {
  const set = (patch: Partial<VoiceLayer>) => onChange({ ...layer, ...patch });

  const setSourceKind = (kind: 'pluck-synth' | 'fm-synth') => {
    if (layer.source.kind === kind) return;
    if (kind === 'pluck-synth') {
      onChange({
        ...layer,
        source: {
          kind: 'pluck-synth',
          params: { attackNoise: 0.5, dampening: 4000, resonance: 0.85, release: 0.5 },
        },
      });
    } else {
      onChange({
        ...layer,
        source: {
          kind: 'fm-synth',
          params: {
            harmonicity: 0.5,
            modulationIndex: 2,
            detune: 0,
            carrierWaveform: 'sine',
            modulatorWaveform: 'sine',
            envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.8 },
            modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.7 },
          },
        },
      });
    }
  };

  return (
    <>
      <SelectRow
        label="Source"
        value={layer.source.kind === 'pluck-synth' || layer.source.kind === 'fm-synth' ? layer.source.kind : 'fm-synth'}
        options={LAYER_SOURCE_KINDS}
        onChange={(kind) => setSourceKind(kind)}
      />
      <ParameterSlider
        label="Mix gain"
        value={layer.gainDb}
        min={-30}
        max={6}
        step={0.5}
        unit="dB"
        precision={1}
        onChange={(gainDb) => set({ gainDb })}
      />
      <ParameterSlider
        label="Octave"
        value={layer.octaveOffset}
        min={-2}
        max={2}
        step={1}
        precision={0}
        onChange={(octaveOffset) => set({ octaveOffset })}
      />
      <ParameterSlider
        label="Detune"
        value={layer.detuneCents}
        min={-50}
        max={50}
        step={1}
        unit="ct"
        precision={0}
        onChange={(detuneCents) => set({ detuneCents })}
      />

      <div className="border-t border-border/30 pt-2 space-y-2">
        <h4 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60">
          Layer synth ({layer.source.kind})
        </h4>
        {layer.source.kind === 'fm-synth' && (
          <FMSynthControls
            params={layer.source.params}
            onChange={(params) =>
              onChange({ ...layer, source: { kind: 'fm-synth', params } })
            }
          />
        )}
        {layer.source.kind === 'pluck-synth' && (
          <PluckSynthControls
            params={layer.source.params}
            onChange={(params) =>
              onChange({ ...layer, source: { kind: 'pluck-synth', params } })
            }
          />
        )}
      </div>
    </>
  );
}

// ─── Voice level / shaping ────────────────────────────────────────────────────

function VoiceLevelControls({
  level,
  onChange,
}: {
  level: VoiceLevel;
  onChange: (next: VoiceLevel) => void;
}) {
  return (
    <>
      <ParameterSlider label="Volume" value={level.volumeDb} min={-80} max={12} step={0.5} unit="dB" precision={1} onChange={(volumeDb) => onChange({ ...level, volumeDb })} />
      <ParameterSlider label="Pan" value={level.pan} min={-1} max={1} step={0.05} onChange={(pan) => onChange({ ...level, pan })} />
    </>
  );
}

function BodyFilterControls({
  params,
  onChange,
}: {
  params: BodyFilterParams;
  onChange: (next: BodyFilterParams) => void;
}) {
  return (
    <>
      <ParameterSlider
        label="Cutoff"
        value={params.cutoff}
        min={200}
        max={12000}
        step={50}
        unit="Hz"
        precision={0}
        onChange={(cutoff) => onChange({ ...params, cutoff })}
      />
      {params.envelope && (
        <p className="text-[10px] font-mono text-muted-foreground/60 italic pl-24">
          Static cutoff is bypassed while the envelope is on.
        </p>
      )}
      <ParameterSlider label="Q" value={params.q} min={0.1} max={18} step={0.1} precision={1} onChange={(q) => onChange({ ...params, q })} />

      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <Label className="cursor-pointer text-xs font-mono uppercase tracking-wider">
          Filter envelope (per note)
        </Label>
        <Switch
          checked={!!params.envelope}
          onCheckedChange={(on) =>
            onChange({
              ...params,
              envelope: on
                ? { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5, baseFrequency: 200, octaves: 4 }
                : undefined,
            })
          }
        />
      </div>
      {params.envelope && (
        <BodyFilterEnvelopeControls
          envelope={params.envelope}
          onChange={(envelope) => onChange({ ...params, envelope })}
        />
      )}
    </>
  );
}

function BodyFilterEnvelopeControls({
  envelope,
  onChange,
}: {
  envelope: BodyFilterEnvelope;
  onChange: (next: BodyFilterEnvelope) => void;
}) {
  const set = (patch: Partial<BodyFilterEnvelope>) => onChange({ ...envelope, ...patch });
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Attack" value={envelope.attack} min={0.001} max={2} step={0.005} unit="s" precision={3} onChange={(attack) => set({ attack })} />
      <ParameterSlider label="Decay" value={envelope.decay} min={0.01} max={3} step={0.01} unit="s" onChange={(decay) => set({ decay })} />
      <ParameterSlider label="Sustain" value={envelope.sustain} min={0} max={1} step={0.01} onChange={(sustain) => set({ sustain })} />
      <ParameterSlider label="Release" value={envelope.release} min={0.01} max={4} step={0.01} unit="s" onChange={(release) => set({ release })} />
      <ParameterSlider label="Base freq" value={envelope.baseFrequency} min={50} max={4000} step={10} unit="Hz" precision={0} onChange={(baseFrequency) => set({ baseFrequency })} />
      <ParameterSlider label="Octaves" value={envelope.octaves} min={0} max={8} step={0.1} precision={1} onChange={(octaves) => set({ octaves })} />
    </div>
  );
}

function CompressorControls({
  params,
  onChange,
}: {
  params: CompressorParams;
  onChange: (next: CompressorParams) => void;
}) {
  return (
    <>
      <ParameterSlider label="Threshold" value={params.threshold} min={-60} max={0} step={0.5} unit="dB" precision={1} onChange={(threshold) => onChange({ ...params, threshold })} />
      <ParameterSlider label="Ratio" value={params.ratio} min={1} max={20} step={0.1} precision={1} onChange={(ratio) => onChange({ ...params, ratio })} />
      <ParameterSlider label="Attack" value={params.attack} min={0.001} max={1} step={0.001} unit="s" precision={3} onChange={(attack) => onChange({ ...params, attack })} />
      <ParameterSlider label="Release" value={params.release} min={0.01} max={2} step={0.005} unit="s" precision={3} onChange={(release) => onChange({ ...params, release })} />
      <ParameterSlider label="Knee" value={params.knee} min={0} max={40} step={0.5} unit="dB" precision={1} onChange={(knee) => onChange({ ...params, knee })} />
    </>
  );
}

// ─── Effects ──────────────────────────────────────────────────────────────────

function EffectControls({
  effects,
  onChange,
  compressor,
  onCompressorChange,
  bodyFilter,
  onBodyFilterChange,
  inputGainDb,
  onInputGainChange,
  level,
  onLevelChange,
  masterReverb,
  onMasterReverbChange,
  voice,
}: {
  effects: EffectsConfig;
  onChange: (next: EffectsConfig) => void;
  compressor: CompressorParams | undefined;
  onCompressorChange: (next: CompressorParams | undefined) => void;
  bodyFilter: BodyFilterParams | undefined;
  onBodyFilterChange: (next: BodyFilterParams | undefined) => void;
  inputGainDb: number | undefined;
  onInputGainChange: (next: number | undefined) => void;
  level: VoiceLevel;
  onLevelChange: (next: VoiceLevel) => void;
  masterReverb: ReverbSettings;
  onMasterReverbChange: (next: ReverbSettings) => void;
  voice: Voice | null;
}) {
  // Section order mirrors the audio chain — top to bottom in the rack.
  //   BodyFilter → Compressor → Distortion → Chorus → Delay → AutoWah
  //     → GraphicEq → Amp → Reverb (per-voice) → Cab → Final EQ
  //     → Voice Level (always-on output stage) → Master Reverb (global)
  return (
    <>
      <InputGainSection
        inputGainDb={inputGainDb}
        onChange={onInputGainChange}
        voice={voice}
      />
      <BodyFilterSection
        params={bodyFilter}
        onChange={onBodyFilterChange}
      />
      <CompressorSection
        params={compressor}
        onChange={onCompressorChange}
      />
      <DistortionSection
        params={effects.distortion}
        onChange={(distortion) => onChange({ ...effects, distortion })}
      />
      <ChorusSection
        params={effects.chorus}
        onChange={(chorus) => onChange({ ...effects, chorus })}
      />
      <DelaySection
        params={effects.delay}
        onChange={(delay) => onChange({ ...effects, delay })}
      />
      <AutoWahSection
        params={effects.autoWah}
        onChange={(autoWah) => onChange({ ...effects, autoWah })}
      />
      <GraphicEqSection
        params={effects.graphicEq}
        onChange={(graphicEq) => onChange({ ...effects, graphicEq })}
      />
      <AmpSection
        amp={effects.amp}
        onChange={(amp) => onChange({ ...effects, amp })}
      />
      <ReverbSection
        reverb={effects.reverb}
        onChange={(reverb) => onChange({ ...effects, reverb })}
      />
      <CabinetSection
        cabIR={effects.cabIR}
        onChange={(cabIR) => onChange({ ...effects, cabIR })}
      />
      <FinalEqSection
        finalEq={effects.finalEq}
        onChange={(finalEq) => onChange({ ...effects, finalEq })}
      />
      <VoiceLevelSection level={level} onChange={onLevelChange} voice={voice} />
      <MasterReverbSection
        reverb={masterReverb}
        onChange={onMasterReverbChange}
      />
    </>
  );
}

function CabinetControls({
  cabIR,
  onChange,
}: {
  cabIR: { url: string; makeupDb?: number };
  onChange: (next: { url: string; makeupDb?: number }) => void;
}) {
  const activeIR = detectCabinetIR(cabIR.url);
  const activeId = activeIR?.id ?? '';
  return (
    <div className="space-y-2 pt-1">
      <label className="flex items-center gap-3 text-xs">
        <span className="w-24 font-mono uppercase tracking-wider text-muted-foreground shrink-0">
          IR
        </span>
        <select
          value={activeId}
          onChange={(e) => {
            const next = CABINET_IRS.find((ir) => ir.id === e.target.value);
            if (next) onChange({ ...cabIR, url: next.url });
          }}
          className="flex-1 h-8 px-2 rounded-md bg-card border border-input font-mono text-xs"
        >
          {!activeIR && <option value="">Custom URL ({truncateUrl(cabIR.url)})</option>}
          {CABINET_IRS.map((ir) => (
            <option key={ir.id} value={ir.id}>
              {ir.label}
            </option>
          ))}
        </select>
      </label>
      {activeIR && (
        <p className="text-[10px] font-mono leading-relaxed text-muted-foreground/80 px-1">
          {activeIR.description}
        </p>
      )}
      <ParameterSlider
        label="Makeup"
        value={cabIR.makeupDb ?? 0}
        min={-24}
        max={24}
        step={0.5}
        unit="dB"
        precision={1}
        onChange={(makeupDb) => onChange({ ...cabIR, makeupDb })}
      />
    </div>
  );
}

function truncateUrl(url: string): string {
  if (url.length <= 40) return url;
  return url.slice(0, 20) + '…' + url.slice(-15);
}

function EffectSection({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-border/30 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={`fx-${title}`} className="cursor-pointer text-xs font-mono uppercase tracking-wider">
          {title}
        </Label>
        <Switch id={`fx-${title}`} checked={enabled} onCheckedChange={onToggle} />
      </div>
      {children}
    </div>
  );
}

function DistortionControls({
  params,
  onChange,
}: {
  params: DistortionParams;
  onChange: (next: DistortionParams) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Drive" value={params.drive} min={0} max={1} step={0.01} onChange={(drive) => onChange({ ...params, drive })} />
      <ParameterSlider label="Wet" value={params.wet} min={0} max={1} step={0.01} onChange={(wet) => onChange({ ...params, wet })} />
      <SelectRow label="Oversample" value={params.oversample} options={OVERSAMPLE_OPTIONS} onChange={(oversample) => onChange({ ...params, oversample })} />
    </div>
  );
}

function ChorusControls({
  params,
  onChange,
}: {
  params: ChorusParams;
  onChange: (next: ChorusParams) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Frequency" value={params.frequency} min={0.05} max={10} step={0.05} unit="Hz" onChange={(frequency) => onChange({ ...params, frequency })} />
      <ParameterSlider label="Depth" value={params.depth} min={0} max={1} step={0.01} onChange={(depth) => onChange({ ...params, depth })} />
      <ParameterSlider label="Feedback" value={params.feedback} min={0} max={1} step={0.01} onChange={(feedback) => onChange({ ...params, feedback })} />
      <ParameterSlider label="Delay time" value={params.delayTime} min={0.001} max={0.05} step={0.0005} unit="s" precision={4} onChange={(delayTime) => onChange({ ...params, delayTime })} />
      <ParameterSlider label="Spread" value={params.spread} min={0} max={180} step={1} unit="°" precision={0} onChange={(spread) => onChange({ ...params, spread })} />
      <SelectRow label="LFO type" value={params.type} options={CHORUS_TYPES} onChange={(type) => onChange({ ...params, type })} />
      <ParameterSlider label="Wet" value={params.wet} min={0} max={1} step={0.01} onChange={(wet) => onChange({ ...params, wet })} />
    </div>
  );
}

function DelayControls({
  params,
  onChange,
}: {
  params: DelayParams;
  onChange: (next: DelayParams) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Time" value={params.delayTime} min={0.01} max={1.5} step={0.01} unit="s" onChange={(delayTime) => onChange({ ...params, delayTime })} />
      <ParameterSlider label="Feedback" value={params.feedback} min={0} max={0.95} step={0.01} onChange={(feedback) => onChange({ ...params, feedback })} />
      <ParameterSlider label="Wet" value={params.wet} min={0} max={1} step={0.01} onChange={(wet) => onChange({ ...params, wet })} />
    </div>
  );
}

function EQControls({
  params,
  onChange,
}: {
  params: EQParams;
  onChange: (next: EQParams) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Low" value={params.low} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(low) => onChange({ ...params, low })} />
      <ParameterSlider label="Mid" value={params.mid} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(mid) => onChange({ ...params, mid })} />
      <ParameterSlider label="High" value={params.high} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(high) => onChange({ ...params, high })} />
      <ParameterSlider label="Low/Mid Hz" value={params.lowFrequency} min={50} max={2000} step={10} unit="Hz" precision={0} onChange={(lowFrequency) => onChange({ ...params, lowFrequency })} />
      <ParameterSlider label="Mid/High Hz" value={params.highFrequency} min={500} max={10000} step={50} unit="Hz" precision={0} onChange={(highFrequency) => onChange({ ...params, highFrequency })} />
    </div>
  );
}

function AutoWahControls({
  params,
  onChange,
}: {
  params: AutoWahParams;
  onChange: (next: AutoWahParams) => void;
}) {
  const set = (patch: Partial<AutoWahParams>) => onChange({ ...params, ...patch });
  return (
    <div className="space-y-2 pt-1">
      <ParameterSlider label="Base freq" value={params.baseFrequency} min={50} max={2000} step={10} unit="Hz" precision={0} onChange={(baseFrequency) => set({ baseFrequency })} />
      <ParameterSlider label="Octaves" value={params.octaves} min={0} max={8} step={0.1} precision={1} onChange={(octaves) => set({ octaves })} />
      <ParameterSlider label="Sensitivity" value={params.sensitivity} min={-40} max={20} step={0.5} unit="dB" precision={1} onChange={(sensitivity) => set({ sensitivity })} />
      <ParameterSlider label="Q" value={params.q} min={0.1} max={18} step={0.1} precision={1} onChange={(q) => set({ q })} />
      <ParameterSlider label="Gain" value={params.gain} min={0} max={4} step={0.05} precision={2} onChange={(gain) => set({ gain })} />
      <ParameterSlider label="Wet" value={params.wet} min={0} max={1} step={0.01} onChange={(wet) => set({ wet })} />
    </div>
  );
}

// ─── Effects rack sections — graphic/slider branching ───────────────────────
// Each effect (Compressor, Distortion, Chorus, Delay, AutoWah, Reverb)
// renders as a RackUnit (horizontal rack-style panel) in graphic mode, and
// the classic EffectSection + ParameterSlider rows in slider mode. Both
// write the same field (preset.compressor for Compressor, preset.effects.*
// for the others). On/off toggle is the RackUnit power switch in graphic
// mode and the EffectSection switch in slider mode.

/** Shared toggle handler for every rack section. Replaces the old pattern
 *  `onChange(on ? { ...DEFAULTS } : undefined)` which threw the user's tuned
 *  params away on toggle-off. The new pattern preserves params across an
 *  off→on cycle by flipping the optional `enabled` flag on the params
 *  themselves. `params=undefined` still means "stage never set in this
 *  preset" — toggle-on creates with defaults; toggle-off is a no-op.
 *  Reads `enabled !== false` so legacy presets/variants without the field
 *  are implicitly on. */
function stageToggle<T extends { enabled?: boolean }>(
  params: T | undefined,
  defaults: T,
  onChange: (next: T | undefined) => void,
): { enabled: boolean; toggle: (on: boolean) => void } {
  const enabled = params != null && params.enabled !== false;
  const toggle = (on: boolean) => {
    if (on) {
      onChange(params ? { ...params, enabled: true } : { ...defaults, enabled: true });
    } else {
      onChange(params ? { ...params, enabled: false } : undefined);
    }
  };
  return { enabled, toggle };
}

const DEFAULT_BODY_FILTER: BodyFilterParams = { cutoff: 3000, q: 0.7 };

function BodyFilterSection({
  params,
  onChange,
}: {
  params: BodyFilterParams | undefined;
  onChange: (next: BodyFilterParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_BODY_FILTER, onChange);
  const current = params ?? DEFAULT_BODY_FILTER;
  const update = (patch: Partial<BodyFilterParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    // Cutoff + Q only in graphic mode. Envelope sub-section (ADSR + base/oct)
    // is slider-mode only for now — nested toggle-with-sub-controls deserves
    // its own design pass and slider mode preserves full functionality.
    return (
      <RackUnit label="Lowpass" enabled={enabled} onToggle={toggle} accent="slate">
        <Knob label="Cutoff" value={current.cutoff} onChange={(v) => update({ cutoff: v })}
          min={200} max={12000} step={50} defaultValue={3000} disabled={!enabled} size={44}
          formatValue={(v) => `${v.toFixed(0)} Hz`} />
        <Knob label="Q" value={current.q} onChange={(v) => update({ q: v })}
          min={0.1} max={18} step={0.1} defaultValue={0.7} disabled={!enabled} size={44}
          formatValue={(v) => v.toFixed(1)} />
        {params?.envelope && (
          <div className="text-[9px] font-mono text-amber-300/70 italic max-w-[120px]">
            Envelope is active (switch to slider view to edit).
          </div>
        )}
      </RackUnit>
    );
  }
  return (
    <EffectSection title="Lowpass (body filter)" enabled={enabled} onToggle={toggle}>
      {params && <BodyFilterControls params={params} onChange={onChange} />}
    </EffectSection>
  );
}

const DEFAULT_COMPRESSOR: CompressorParams = {
  threshold: -18, ratio: 4, attack: 0.005, release: 0.1, knee: 6,
};

function CompressorSection({
  params,
  onChange,
}: {
  params: CompressorParams | undefined;
  onChange: (next: CompressorParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_COMPRESSOR, onChange);
  const current = params ?? DEFAULT_COMPRESSOR;
  const update = (patch: Partial<CompressorParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Compressor" enabled={enabled} onToggle={toggle} accent="green">
        <Knob label="Thresh" value={current.threshold} onChange={(v) => update({ threshold: v })}
          min={-60} max={0} step={0.5} defaultValue={-18} disabled={!enabled} size={44}
          formatValue={(v) => `${v.toFixed(1)} dB`} />
        <Knob label="Ratio" value={current.ratio} onChange={(v) => update({ ratio: v })}
          min={1} max={20} step={0.1} defaultValue={4} disabled={!enabled} size={44}
          formatValue={(v) => `${v.toFixed(1)}:1`} />
        <Knob label="Attack" value={current.attack} onChange={(v) => update({ attack: v })}
          min={0.001} max={1} step={0.001} defaultValue={0.005} disabled={!enabled} size={44}
          formatValue={(v) => `${(v * 1000).toFixed(0)} ms`} />
        <Knob label="Release" value={current.release} onChange={(v) => update({ release: v })}
          min={0.01} max={2} step={0.005} defaultValue={0.1} disabled={!enabled} size={44}
          formatValue={(v) => `${(v * 1000).toFixed(0)} ms`} />
        <Knob label="Knee" value={current.knee} onChange={(v) => update({ knee: v })}
          min={0} max={40} step={0.5} defaultValue={6} disabled={!enabled} size={44}
          formatValue={(v) => `${v.toFixed(1)} dB`} />
      </RackUnit>
    );
  }
  return (
    <EffectSection title="Compressor" enabled={enabled} onToggle={toggle}>
      {params && (
        <div className="space-y-2 pt-1">
          <CompressorControls params={params} onChange={onChange} />
        </div>
      )}
    </EffectSection>
  );
}

const DEFAULT_DISTORTION: DistortionParams = { drive: 0.3, wet: 0.25, oversample: '2x' };

function DistortionSection({
  params,
  onChange,
}: {
  params: DistortionParams | undefined;
  onChange: (next: DistortionParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_DISTORTION, onChange);
  const current = params ?? DEFAULT_DISTORTION;
  const update = (patch: Partial<DistortionParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Distortion" enabled={enabled} onToggle={toggle} accent="orange">
          <Knob label="Drive" value={current.drive} onChange={(v) => update({ drive: v })}
            min={0} max={1} step={0.01} defaultValue={0.3} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
          <Knob label="Wet" value={current.wet} onChange={(v) => update({ wet: v })}
            min={0} max={1} step={0.01} defaultValue={0.25} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
        </RackUnit>
    );
  }
  return (
    <EffectSection title="Distortion" enabled={enabled} onToggle={toggle}>
      {params && <DistortionControls params={params} onChange={onChange} />}
    </EffectSection>
  );
}

const DEFAULT_CHORUS: ChorusParams = {
  frequency: 1.5, depth: 0.3, wet: 0.2, type: 'sine',
  feedback: 0.1, delayTime: 0.0035, spread: 180,
};

function ChorusSection({
  params,
  onChange,
}: {
  params: ChorusParams | undefined;
  onChange: (next: ChorusParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_CHORUS, onChange);
  const current = params ?? DEFAULT_CHORUS;
  const update = (patch: Partial<ChorusParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Chorus" enabled={enabled} onToggle={toggle} accent="blue">
          <Knob label="Rate" value={current.frequency} onChange={(v) => update({ frequency: v })}
            min={0.05} max={10} step={0.05} defaultValue={1.5} disabled={!enabled} size={44}
            formatValue={(v) => `${v.toFixed(2)} Hz`} />
          <Knob label="Depth" value={current.depth} onChange={(v) => update({ depth: v })}
            min={0} max={1} step={0.01} defaultValue={0.3} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
          <Knob label="Feedback" value={current.feedback} onChange={(v) => update({ feedback: v })}
            min={0} max={1} step={0.01} defaultValue={0.1} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
          <Knob label="Wet" value={current.wet} onChange={(v) => update({ wet: v })}
            min={0} max={1} step={0.01} defaultValue={0.2} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
        </RackUnit>
    );
  }
  return (
    <EffectSection title="Chorus" enabled={enabled} onToggle={toggle}>
      {params && <ChorusControls params={params} onChange={onChange} />}
    </EffectSection>
  );
}

const DEFAULT_DELAY: DelayParams = { delayTime: 0.25, feedback: 0.3, wet: 0.15 };

function DelaySection({
  params,
  onChange,
}: {
  params: DelayParams | undefined;
  onChange: (next: DelayParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_DELAY, onChange);
  const current = params ?? DEFAULT_DELAY;
  const update = (patch: Partial<DelayParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Delay" enabled={enabled} onToggle={toggle} accent="purple">
          <Knob label="Time" value={current.delayTime} onChange={(v) => update({ delayTime: v })}
            min={0.01} max={1.5} step={0.01} defaultValue={0.25} disabled={!enabled} size={44}
            formatValue={(v) => `${(v * 1000).toFixed(0)} ms`} />
          <Knob label="Feedback" value={current.feedback} onChange={(v) => update({ feedback: v })}
            min={0} max={0.95} step={0.01} defaultValue={0.3} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
          <Knob label="Wet" value={current.wet} onChange={(v) => update({ wet: v })}
            min={0} max={1} step={0.01} defaultValue={0.15} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
        </RackUnit>
    );
  }
  return (
    <EffectSection title="Delay" enabled={enabled} onToggle={toggle}>
      {params && <DelayControls params={params} onChange={onChange} />}
    </EffectSection>
  );
}

const DEFAULT_AUTOWAH: AutoWahParams = {
  baseFrequency: 100, octaves: 6, sensitivity: 0, q: 2, gain: 2, wet: 0.5,
};

function AutoWahSection({
  params,
  onChange,
}: {
  params: AutoWahParams | undefined;
  onChange: (next: AutoWahParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_AUTOWAH, onChange);
  const current = params ?? DEFAULT_AUTOWAH;
  const update = (patch: Partial<AutoWahParams>) => params && onChange({ ...params, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Auto-wah" enabled={enabled} onToggle={toggle} accent="red">
          <Knob label="Base" value={current.baseFrequency} onChange={(v) => update({ baseFrequency: v })}
            min={50} max={2000} step={10} defaultValue={100} disabled={!enabled} size={44}
            formatValue={(v) => `${v.toFixed(0)} Hz`} />
          <Knob label="Octaves" value={current.octaves} onChange={(v) => update({ octaves: v })}
            min={0} max={8} step={0.1} defaultValue={6} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(1)} />
          <Knob label="Sense" value={current.sensitivity} onChange={(v) => update({ sensitivity: v })}
            min={-40} max={20} step={0.5} defaultValue={0} disabled={!enabled} size={44}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`} />
          <Knob label="Q" value={current.q} onChange={(v) => update({ q: v })}
            min={0.1} max={18} step={0.1} defaultValue={2} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(1)} />
          <Knob label="Wet" value={current.wet} onChange={(v) => update({ wet: v })}
            min={0} max={1} step={0.01} defaultValue={0.5} disabled={!enabled} size={44}
            formatValue={(v) => v.toFixed(2)} />
        </RackUnit>
    );
  }
  return (
    <EffectSection title="Auto-wah (envelope filter)" enabled={enabled} onToggle={toggle}>
      {params && <AutoWahControls params={params} onChange={onChange} />}
    </EffectSection>
  );
}

// ─── Post-amp sections — Phase 3c (Reverb / Cabinet / Final EQ) ─────────────

const DEFAULT_REVERB: VoiceReverbParams = { roomSize: 0.5, wet: 0.25 };

function ReverbSection({
  reverb,
  onChange,
}: {
  reverb: VoiceReverbParams | undefined;
  onChange: (next: VoiceReverbParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(reverb, DEFAULT_REVERB, onChange);
  const current = reverb ?? DEFAULT_REVERB;
  const update = (patch: Partial<VoiceReverbParams>) => reverb && onChange({ ...reverb, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Reverb" enabled={enabled} onToggle={toggle} accent="yellow">
        <Knob label="Room" value={current.roomSize} onChange={(v) => update({ roomSize: v })}
          min={0} max={1} step={0.01} defaultValue={0.5} disabled={!enabled} size={44}
          formatValue={(v) => v.toFixed(2)} />
        <Knob label="Wet" value={current.wet} onChange={(v) => update({ wet: v })}
          min={0} max={1} step={0.01} defaultValue={0.25} disabled={!enabled} size={44}
          formatValue={(v) => v.toFixed(2)} />
      </RackUnit>
    );
  }
  return (
    <EffectSection title="Reverb (per-voice spring)" enabled={enabled} onToggle={toggle}>
      {reverb && (
        <div className="space-y-2 pt-1">
          <ParameterSlider label="Room size" value={reverb.roomSize} min={0} max={1} step={0.01}
            onChange={(roomSize) => onChange({ ...reverb, roomSize })} />
          <ParameterSlider label="Wet" value={reverb.wet} min={0} max={1} step={0.01}
            onChange={(wet) => onChange({ ...reverb, wet })} />
        </div>
      )}
    </EffectSection>
  );
}

function CabinetSection({
  cabIR,
  onChange,
}: {
  cabIR: CabIRParams | undefined;
  onChange: (next: CabIRParams | undefined) => void;
}) {
  const mode = useViewMode();
  const DEFAULT_CABIR: CabIRParams = { url: CABINET_IRS[0]!.url, makeupDb: 0 };
  const { enabled, toggle } = stageToggle(cabIR, DEFAULT_CABIR, onChange);
  if (mode === 'graphic') {
    const irOptions = CABINET_IRS.map((ir) => ({ id: ir.id, label: ir.label }));
    const currentIrId = cabIR ? detectCabinetIR(cabIR.url)?.id : undefined;
    const activeIR = cabIR ? detectCabinetIR(cabIR.url) : null;
    return (
      <div className="border border-border/30 rounded-md p-3 flex gap-6 items-start justify-center">
        <Cabinet
          irOptions={irOptions}
          selectedIrId={currentIrId}
          onIrChange={(id) => {
            const next = CABINET_IRS.find((ir) => ir.id === id);
            if (next && cabIR) onChange({ ...cabIR, url: next.url });
          }}
          enabled={enabled}
          onToggle={toggle}
        />
        <div className="flex flex-col items-center gap-2 pt-12">
          <Knob
            label="Makeup"
            value={cabIR?.makeupDb ?? 0}
            onChange={(v) => cabIR && onChange({ ...cabIR, makeupDb: v })}
            min={-24}
            max={24}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          {activeIR && (
            <p className="text-[10px] font-mono text-foreground/60 max-w-[180px] text-center leading-tight">
              {activeIR.description}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <EffectSection title="Cabinet (speaker + mic IR)" enabled={enabled} onToggle={toggle}>
      {cabIR && <CabinetControls cabIR={cabIR} onChange={onChange} />}
    </EffectSection>
  );
}

const DEFAULT_FINAL_EQ: EQParams = {
  low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500,
};

function FinalEqSection({
  finalEq,
  onChange,
}: {
  finalEq: EQParams | undefined;
  onChange: (next: EQParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(finalEq, DEFAULT_FINAL_EQ, onChange);
  const current = finalEq ?? DEFAULT_FINAL_EQ;
  const update = (patch: Partial<EQParams>) => finalEq && onChange({ ...finalEq, ...patch });
  if (mode === 'graphic') {
    return (
      <div className="border border-border/30 rounded-md p-3">
        <AmpPanel label="Final EQ" enabled={enabled} onToggle={toggle}>
          <Knob label="Low" value={current.low} onChange={(v) => update({ low: v })}
            min={-12} max={12} step={0.5} defaultValue={0} disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`} />
          <Knob label="Mid" value={current.mid} onChange={(v) => update({ mid: v })}
            min={-12} max={12} step={0.5} defaultValue={0} disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`} />
          <Knob label="High" value={current.high} onChange={(v) => update({ high: v })}
            min={-12} max={12} step={0.5} defaultValue={0} disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`} />
          <Knob label="L/M Hz" value={current.lowFrequency} onChange={(v) => update({ lowFrequency: v })}
            min={80} max={1000} step={10} defaultValue={400} disabled={!enabled}
            formatValue={(v) => `${v.toFixed(0)} Hz`} />
          <Knob label="M/H Hz" value={current.highFrequency} onChange={(v) => update({ highFrequency: v })}
            min={500} max={8000} step={50} defaultValue={2500} disabled={!enabled}
            formatValue={(v) => `${v.toFixed(0)} Hz`} />
        </AmpPanel>
      </div>
    );
  }
  return (
    <EffectSection title="Final EQ (post-cabinet)" enabled={enabled} onToggle={toggle}>
      {finalEq && <EQControls params={finalEq} onChange={onChange} />}
    </EffectSection>
  );
}

// Clip meter — small horizontal level bar + clip LED that latches red for
// ~1s after any peak ≥ -0.5 dBFS. Polls a level-getter function at ~60 fps
// via rAF. Designed to be drop-in next to whatever audio stage the caller
// wants to monitor.
function ClipMeter({
  getLevelDb,
  label,
  width = 64,
}: {
  getLevelDb: () => number;
  label?: string;
  width?: number;
}) {
  const [levelDb, setLevelDb] = useState<number>(-Infinity);
  const [clipped, setClipped] = useState(false);
  const clipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = getLevelDb();
      setLevelDb(v);
      if (v >= -0.5) {
        setClipped(true);
        if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
        clipTimeoutRef.current = setTimeout(() => setClipped(false), 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
    };
  }, [getLevelDb]);

  // Map -60..0 dB → 0..100% bar width. Below -60 dB displays as nothing.
  const pct = Math.max(0, Math.min(100, ((levelDb + 60) / 60) * 100));
  // Color: green up to -12 dB, yellow -12..-3, orange -3..-0.5, red ≥ -0.5.
  const barColor =
    levelDb >= -0.5 ? 'bg-red-500'
    : levelDb >= -3 ? 'bg-orange-400'
    : levelDb >= -12 ? 'bg-yellow-400'
    : 'bg-green-500';

  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
      <div
        className="h-1.5 bg-black/40 rounded overflow-hidden"
        style={{ width: `${width}px` }}
        title={`${levelDb === -Infinity ? '−∞' : levelDb.toFixed(1)} dBFS`}
      >
        <div className={`h-full transition-[width] duration-75 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div
        className={`w-2 h-2 rounded-full ${clipped ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]' : 'bg-red-500/15'}`}
        title={clipped ? 'CLIPPING' : 'no clip'}
      />
    </div>
  );
}

// Input gain — first stage in the audio chain, after the synth/sampler
// mixer and BEFORE bodyFilter / compressor / effects / amp. Lets the user
// attenuate hot samples (or boost quiet ones) without driving the amp's
// saturators harder. At slider min (-80 dB) the signal is perceptually
// grounded — useful for verifying the chain end-to-end is muted.
function InputGainSection({
  inputGainDb,
  onChange,
  voice,
}: {
  inputGainDb: number | undefined;
  onChange: (next: number | undefined) => void;
  voice: Voice | null;
}) {
  const mode = useViewMode();
  const value = inputGainDb ?? 0;
  // Stable getter — wraps the voice ref so re-renders don't reset the meter's
  // rAF loop. When voice is null (chain not built yet), getter returns -∞.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const getLevelDb = useMemo(() => () => voiceRef.current?.getInputLevelDb() ?? -Infinity, []);
  if (mode === 'graphic') {
    return (
      <RackUnit label="Input" enabled accent="slate">
        <Knob
          label="Gain"
          value={value}
          onChange={(v) => onChange(v === 0 ? undefined : v)}
          min={-80}
          max={24}
          step={0.5}
          defaultValue={0}
          size={44}
          formatValue={(v) => (v <= -80 ? '−∞ dB' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`)}
        />
        <div className="flex flex-col items-center gap-1 pt-1">
          <ClipMeter getLevelDb={getLevelDb} label="In" width={56} />
        </div>
      </RackUnit>
    );
  }
  return (
    <div className="border border-border/30 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Input gain</div>
        <ClipMeter getLevelDb={getLevelDb} label="In" />
      </div>
      <ParameterSlider
        label="Gain"
        value={value}
        min={-80}
        max={24}
        step={0.5}
        unit="dB"
        precision={1}
        onChange={(v) => onChange(v === 0 ? undefined : v)}
      />
    </div>
  );
}

// Voice Level — per-voice output stage (volume + pan). Always-on; no toggle.
// Sits between Final EQ and Master Reverb in the rack — matches the audio
// chain where `Tone.Volume` + `Tone.Panner` are the last per-voice nodes
// before the signal hits MasterBus.
function VoiceLevelSection({
  level,
  onChange,
  voice,
}: {
  level: VoiceLevel;
  onChange: (next: VoiceLevel) => void;
  voice: Voice | null;
}) {
  const mode = useViewMode();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const getLevelDb = useMemo(() => () => voiceRef.current?.getOutputLevelDb() ?? -Infinity, []);
  if (mode === 'graphic') {
    return (
      <RackUnit label="Voice Level" enabled accent="slate">
        <Knob label="Volume" value={level.volumeDb} onChange={(v) => onChange({ ...level, volumeDb: v })}
          min={-80} max={12} step={0.5} defaultValue={0} size={44}
          formatValue={(v) => v <= -80 ? '−∞ dB' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`} />
        <Knob label="Pan" value={level.pan} onChange={(v) => onChange({ ...level, pan: v })}
          min={-1} max={1} step={0.05} defaultValue={0} size={44}
          formatValue={(v) => v === 0 ? 'C' : v < 0 ? `L${(Math.abs(v) * 100).toFixed(0)}` : `R${(v * 100).toFixed(0)}`} />
        <div className="flex flex-col items-center gap-1 pt-1">
          <ClipMeter getLevelDb={getLevelDb} label="Out" width={56} />
        </div>
      </RackUnit>
    );
  }
  return (
    <div className="border border-border/30 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Voice level</div>
        <ClipMeter getLevelDb={getLevelDb} label="Out" />
      </div>
      <VoiceLevelControls level={level} onChange={onChange} />
    </div>
  );
}

// Master Reverb — global setting (lives on MasterBus, shared by all voices).
// Renders as the last rack unit with a slate accent stripe to visually signal
// "different scope" vs the yellow per-voice Reverb earlier in the rack. Settings
// always exist; toggle flips `enabled` rather than adding/removing config.
function MasterReverbSection({
  reverb,
  onChange,
}: {
  reverb: ReverbSettings;
  onChange: (next: ReverbSettings) => void;
}) {
  const mode = useViewMode();
  const enabled = reverb.enabled;
  const toggle = (on: boolean) => onChange({ ...reverb, enabled: on });
  const update = (patch: Partial<ReverbSettings>) => onChange({ ...reverb, ...patch });
  if (mode === 'graphic') {
    return (
      <RackUnit label="Master Reverb" enabled={enabled} onToggle={toggle} accent="slate">
        <Knob label="Decay" value={reverb.decay} onChange={(v) => update({ decay: v })}
          min={0.1} max={6} step={0.05} defaultValue={1.5} disabled={!enabled} size={44}
          formatValue={(v) => `${v.toFixed(2)} s`} />
        <Knob label="Predelay" value={reverb.preDelay} onChange={(v) => update({ preDelay: v })}
          min={0} max={0.2} step={0.005} defaultValue={0.01} disabled={!enabled} size={44}
          formatValue={(v) => `${(v * 1000).toFixed(0)} ms`} />
        <Knob label="Wet" value={reverb.wet} onChange={(v) => update({ wet: v })}
          min={0} max={1} step={0.01} defaultValue={0.18} disabled={!enabled} size={44}
          formatValue={(v) => v.toFixed(2)} />
        <div className="text-[9px] font-mono text-zinc-400/70 italic max-w-[140px] leading-tight">
          Global · shared across all voices · not saved with variant
        </div>
      </RackUnit>
    );
  }
  return (
    <EffectSection title="Master Reverb (global send)" enabled={enabled} onToggle={toggle}>
      <div className="space-y-2 pt-1">
        <ParameterSlider label="Decay" value={reverb.decay} min={0.1} max={6} step={0.05} unit="s"
          onChange={(decay) => update({ decay })} />
        <ParameterSlider label="Pre-delay" value={reverb.preDelay} min={0} max={0.2} step={0.005} unit="s" precision={3}
          onChange={(preDelay) => update({ preDelay })} />
        <ParameterSlider label="Wet" value={reverb.wet} min={0} max={1} step={0.01}
          onChange={(wet) => update({ wet })} />
      </div>
    </EffectSection>
  );
}

// Graphic EQ — Boss GE-7-inspired 7-band pre-amp tone shaper. Renders as
// vertical faders in BOTH view modes — the metaphor IS sliders, so it'd be
// weird to map them to knobs. Graphic mode wraps in a RackUnit; slider mode
// wraps in the classic EffectSection. The fader layout itself is identical.
const GRAPHIC_EQ_BAND_DEFS: ReadonlyArray<{
  key: keyof Omit<GraphicEqParams, 'levelDb' | 'enabled'>;
  label: string;
}> = [
  { key: 'band100Hz',  label: '100' },
  { key: 'band200Hz',  label: '200' },
  { key: 'band400Hz',  label: '400' },
  { key: 'band800Hz',  label: '800' },
  { key: 'band1_6kHz', label: '1.6k' },
  { key: 'band3_2kHz', label: '3.2k' },
  { key: 'band6_4kHz', label: '6.4k' },
];

const DEFAULT_GRAPHIC_EQ: GraphicEqParams = {
  band100Hz: 0, band200Hz: 0, band400Hz: 0, band800Hz: 0,
  band1_6kHz: 0, band3_2kHz: 0, band6_4kHz: 0, levelDb: 0,
};

function GraphicEqSection({
  params,
  onChange,
}: {
  params: GraphicEqParams | undefined;
  onChange: (next: GraphicEqParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(params, DEFAULT_GRAPHIC_EQ, onChange);
  const current = params ?? DEFAULT_GRAPHIC_EQ;
  const update = (patch: Partial<GraphicEqParams>) => params && onChange({ ...params, ...patch });

  const faders = (
    <div className="flex items-end justify-start gap-2 flex-wrap">
      {GRAPHIC_EQ_BAND_DEFS.map(({ key, label }) => (
        <VerticalSlider
          key={key}
          label={label}
          value={current[key]}
          onChange={(v) => update({ [key]: v } as Partial<GraphicEqParams>)}
          min={-15}
          max={15}
          step={0.5}
          defaultValue={0}
          centerValue={0}
          disabled={!enabled}
          formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
        />
      ))}
      {/* Visual divider between the 7 EQ bands and the Level slider */}
      <div className="w-px self-stretch bg-zinc-700/60 mx-1" aria-hidden="true" />
      <VerticalSlider
        label="Level"
        value={current.levelDb}
        onChange={(v) => update({ levelDb: v })}
        min={-15}
        max={15}
        step={0.5}
        defaultValue={0}
        centerValue={0}
        disabled={!enabled}
        formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
      />
    </div>
  );

  if (mode === 'graphic') {
    return (
      <RackUnit label="Graphic EQ" enabled={enabled} onToggle={toggle} accent="amber">
        {faders}
      </RackUnit>
    );
  }
  return (
    <EffectSection title="Graphic EQ (pre-amp, 7-band)" enabled={enabled} onToggle={toggle}>
      <div className="pt-2 flex justify-center">{faders}</div>
    </EffectSection>
  );
}

// ─── Amp section — Phase 2d proof of concept ─────────────────────────────────
// First Sound Lab section that branches on view mode. In graphic mode renders
// the new AmpPanel with Knobs; in slider mode renders the classic
// EffectSection + ParameterSlider style. Both write to the same EffectsConfig
// `amp` field so the chosen view doesn't change the persisted data.
const DEFAULT_AMP: AmpParams = {
  modelId: DEFAULT_AMP_MODEL_ID,
  preGainDb: 0,
  preDrive: 0.3,
  bass: 0,
  mid: 0,
  treble: 0,
  presence: 0,
  powerDrive: 0.1,
  outputDb: 0,
};

function AmpSection({
  amp,
  onChange,
}: {
  amp: AmpParams | undefined;
  onChange: (next: AmpParams | undefined) => void;
}) {
  const mode = useViewMode();
  const { enabled, toggle } = stageToggle(amp, DEFAULT_AMP, onChange);
  const current = amp ?? DEFAULT_AMP;
  const updateField = <K extends keyof AmpParams>(key: K, value: AmpParams[K]) => {
    if (!amp) return;
    onChange({ ...amp, [key]: value });
  };

  const activeModel = getAmpModel(current.modelId);
  const modelPicker = (
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Amp Model
      </label>
      <select
        value={current.modelId ?? DEFAULT_AMP_MODEL_ID}
        onChange={(e) => updateField('modelId', e.target.value)}
        disabled={!enabled}
        className="h-8 px-2 rounded-md bg-card border border-input text-xs font-mono disabled:opacity-40"
      >
        {AMP_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.category})
          </option>
        ))}
      </select>
      <p className="text-[10px] text-muted-foreground leading-snug">{activeModel.description}</p>
    </div>
  );

  if (mode === 'graphic') {
    return (
      <div className="border border-border/30 rounded-md p-3">
        {modelPicker}
        <AmpPanel label={activeModel.name} enabled={enabled} onToggle={toggle}>
          <Knob
            label="Pre Gain"
            value={current.preGainDb}
            onChange={(v) => updateField('preGainDb', v)}
            min={-12}
            max={24}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          <Knob
            label="Drive"
            value={current.preDrive}
            onChange={(v) => updateField('preDrive', v)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.3}
            disabled={!enabled}
            formatValue={(v) => v.toFixed(2)}
          />
          <Knob
            label="Bass"
            value={current.bass}
            onChange={(v) => updateField('bass', v)}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <Knob
            label="Mid"
            value={current.mid}
            onChange={(v) => updateField('mid', v)}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <Knob
            label="Treble"
            value={current.treble}
            onChange={(v) => updateField('treble', v)}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <Knob
            label="Presence"
            value={current.presence}
            onChange={(v) => updateField('presence', v)}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <Knob
            label="Power"
            value={current.powerDrive}
            onChange={(v) => updateField('powerDrive', v)}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.1}
            disabled={!enabled}
            formatValue={(v) => v.toFixed(2)}
          />
          <Knob
            label="Out"
            value={current.outputDb}
            onChange={(v) => updateField('outputDb', v)}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            disabled={!enabled}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
        </AmpPanel>
      </div>
    );
  }

  // Slider mode — wrap in the classic EffectSection. Each row is a
  // ParameterSlider against the AmpParams field.
  return (
    <EffectSection title="Amp" enabled={enabled} onToggle={toggle}>
      {amp && (
        <div className="space-y-2 pt-1">
          {modelPicker}
          <ParameterSlider label="Pre Gain" value={amp.preGainDb} min={-12} max={24} step={0.5} unit="dB" precision={1} onChange={(preGainDb) => onChange({ ...amp, preGainDb })} />
          <ParameterSlider label="Pre Drive" value={amp.preDrive} min={0} max={1} step={0.01} onChange={(preDrive) => onChange({ ...amp, preDrive })} />
          <ParameterSlider label="Bass" value={amp.bass} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(bass) => onChange({ ...amp, bass })} />
          <ParameterSlider label="Mid" value={amp.mid} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(mid) => onChange({ ...amp, mid })} />
          <ParameterSlider label="Treble" value={amp.treble} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(treble) => onChange({ ...amp, treble })} />
          <ParameterSlider label="Presence" value={amp.presence} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(presence) => onChange({ ...amp, presence })} />
          <ParameterSlider label="Power Drive" value={amp.powerDrive} min={0} max={1} step={0.01} onChange={(powerDrive) => onChange({ ...amp, powerDrive })} />
          <ParameterSlider label="Output" value={amp.outputDb} min={-12} max={12} step={0.5} unit="dB" precision={1} onChange={(outputDb) => onChange({ ...amp, outputDb })} />
        </div>
      )}
    </EffectSection>
  );
}

