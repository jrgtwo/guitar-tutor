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
import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    const v = new Voice(pendingPreset);
    setVoice(v);
    return () => {
      v.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labInstrumentId, pendingPreset.source.kind]);

  useEffect(() => {
    if (!voice) return;
    if (pendingPreset.source.kind === 'pluck-synth' || pendingPreset.source.kind === 'fm-synth') {
      voice.updateSynthParams(pendingPreset.source.params);
    }
    voice.updateLayer(pendingPreset.layer);
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
    setPendingReverb((prev) => (typeof next === 'function' ? next(prev) : next));
    setIsDirty(true);
  };

  const onSave = () => {
    if (isActiveDefault || !activeUserVariant) return;
    updateVariant(activeUserVariant.id, { preset: pendingPreset, name: pendingPreset.name });
    setReverbInStore(pendingReverb);
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-charcoal-raised/70 backdrop-blur px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">Sound Lab</h1>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Tune voice variants · /?lab=1
        </span>
        <div className="ml-auto flex items-center gap-2">
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

        {/* Voice level (always-on) */}
        <Section title="Voice level">
          <VoiceLevelControls
            level={pendingPreset.level}
            onChange={(level) => updateActive((p) => ({ ...p, level }))}
          />
        </Section>

        {/* Optional shaping blocks */}
        <Section title="Body filter">
          <ToggleableBlock
            enabled={!!pendingPreset.bodyFilter}
            onToggle={(on) =>
              updateActive((p) => ({
                ...p,
                bodyFilter: on ? { cutoff: 3000, q: 0.7 } : undefined,
              }))
            }
            label="Lowpass on"
          >
            {pendingPreset.bodyFilter && (
              <BodyFilterControls
                params={pendingPreset.bodyFilter}
                onChange={(bodyFilter) => updateActive((p) => ({ ...p, bodyFilter }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        <Section title="Compressor">
          <ToggleableBlock
            enabled={!!pendingPreset.compressor}
            onToggle={(on) =>
              updateActive((p) => ({
                ...p,
                compressor: on
                  ? { threshold: -18, ratio: 4, attack: 0.005, release: 0.1, knee: 6 }
                  : undefined,
              }))
            }
            label="Compressor on"
          >
            {pendingPreset.compressor && (
              <CompressorControls
                params={pendingPreset.compressor}
                onChange={(compressor) => updateActive((p) => ({ ...p, compressor }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        {/* Effects (now always available regardless of family — lab is exploratory) */}
        <Section title="Effects">
          <EffectControls
            effects={pendingPreset.effects ?? {}}
            onChange={(effects) => updateActive((p) => ({ ...p, effects }))}
          />
        </Section>

        {/* Master / reverb */}
        <Section title="Master · Reverb">
          <div className="flex items-center justify-between">
            <Label htmlFor="lab-reverb-on" className="cursor-pointer">
              Reverb enabled
            </Label>
            <Switch
              id="lab-reverb-on"
              checked={pendingReverb.enabled}
              onCheckedChange={(enabled) => updateReverb((r) => ({ ...r, enabled }))}
            />
          </div>
          <ParameterSlider
            label="Decay"
            value={pendingReverb.decay}
            min={0.1}
            max={6}
            step={0.05}
            unit="s"
            onChange={(decay) => updateReverb((r) => ({ ...r, decay }))}
          />
          <ParameterSlider
            label="Pre-delay"
            value={pendingReverb.preDelay}
            min={0}
            max={0.2}
            step={0.005}
            unit="s"
            precision={3}
            onChange={(preDelay) => updateReverb((r) => ({ ...r, preDelay }))}
          />
          <ParameterSlider
            label="Wet"
            value={pendingReverb.wet}
            min={0}
            max={1}
            step={0.01}
            onChange={(wet) => updateReverb((r) => ({ ...r, wet }))}
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
  samples: Readonly<Record<string, string>>;
  release: number | undefined;
  onChange: (samples: Record<string, string>, release: number) => void;
}) {
  const matchedPack = useMemo(() => detectSamplePack(samples), [samples]);
  const sampleCount = Object.keys(samples).length;
  const effectiveRelease = release ?? 1;
  const [customOpen, setCustomOpen] = useState(false);
  const [customJson, setCustomJson] = useState(() => JSON.stringify(samples, null, 2));
  const [customError, setCustomError] = useState<string | null>(null);

  const onPickPack = (packId: string) => {
    const pack = SAMPLE_PACKS.find((p: { id: string }) => p.id === packId);
    if (!pack) return;
    onChange({ ...pack.samples }, effectiveRelease);
    setCustomJson(JSON.stringify(pack.samples, null, 2));
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
      onChange(out, effectiveRelease);
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
              setCustomJson(JSON.stringify(samples, null, 2));
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
        onChange={(r) => onChange({ ...samples }, r)}
      />
      <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed pt-2">
        {sampleCount === 0
          ? 'No samples — voice falls back to a neutral PluckSynth at play time. Pick a pack above to attach samples.'
          : `${sampleCount} samples mapped · Tone.Sampler pitch-shifts between them. First note may lag slightly on cold load while samples decode.`}
      </p>
      {customOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded border border-border/60 bg-charcoal-deep/40 p-3">
          <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
            Custom sample map (JSON)
          </Label>
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
      return { kind: 'sampler', samples: {}, release: 1 };
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
      <ParameterSlider label="Volume" value={level.volumeDb} min={-24} max={12} step={0.5} unit="dB" precision={1} onChange={(volumeDb) => onChange({ ...level, volumeDb })} />
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
}: {
  effects: EffectsConfig;
  onChange: (next: EffectsConfig) => void;
}) {
  return (
    <>
      <EffectSection
        title="Distortion"
        enabled={!!effects.distortion}
        onToggle={(on) =>
          onChange({
            ...effects,
            distortion: on ? { drive: 0.3, wet: 0.25, oversample: '2x' } : undefined,
          })
        }
      >
        {effects.distortion && (
          <DistortionControls
            params={effects.distortion}
            onChange={(distortion) => onChange({ ...effects, distortion })}
          />
        )}
      </EffectSection>

      <EffectSection
        title="Chorus"
        enabled={!!effects.chorus}
        onToggle={(on) =>
          onChange({
            ...effects,
            chorus: on
              ? {
                  frequency: 1.5,
                  depth: 0.3,
                  wet: 0.2,
                  type: 'sine',
                  feedback: 0.1,
                  delayTime: 0.0035,
                  spread: 180,
                }
              : undefined,
          })
        }
      >
        {effects.chorus && (
          <ChorusControls
            params={effects.chorus}
            onChange={(chorus) => onChange({ ...effects, chorus })}
          />
        )}
      </EffectSection>

      <EffectSection
        title="Delay"
        enabled={!!effects.delay}
        onToggle={(on) =>
          onChange({
            ...effects,
            delay: on ? { delayTime: 0.25, feedback: 0.3, wet: 0.15 } : undefined,
          })
        }
      >
        {effects.delay && (
          <DelayControls
            params={effects.delay}
            onChange={(delay) => onChange({ ...effects, delay })}
          />
        )}
      </EffectSection>

      <EffectSection
        title="EQ"
        enabled={!!effects.eq}
        onToggle={(on) =>
          onChange({
            ...effects,
            eq: on
              ? { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 }
              : undefined,
          })
        }
      >
        {effects.eq && (
          <EQControls
            params={effects.eq}
            onChange={(eq) => onChange({ ...effects, eq })}
          />
        )}
      </EffectSection>

      <EffectSection
        title="Auto-wah (envelope filter)"
        enabled={!!effects.autoWah}
        onToggle={(on) =>
          onChange({
            ...effects,
            autoWah: on
              ? { baseFrequency: 100, octaves: 6, sensitivity: 0, q: 2, gain: 2, wet: 0.5 }
              : undefined,
          })
        }
      >
        {effects.autoWah && (
          <AutoWahControls
            params={effects.autoWah}
            onChange={(autoWah) => onChange({ ...effects, autoWah })}
          />
        )}
      </EffectSection>

      <EffectSection
        title="Cabinet (speaker + mic IR)"
        enabled={!!effects.cabIR}
        onToggle={(on) =>
          onChange({
            ...effects,
            // Default to the warmest registered IR — works for clean to
            // mild-crunch hollowbody tones. User can swap in the picker.
            cabIR: on ? { url: CABINET_IRS[0]!.url, makeupDb: 0 } : undefined,
          })
        }
      >
        {effects.cabIR && (
          <CabinetControls
            cabIR={effects.cabIR}
            onChange={(cabIR) => onChange({ ...effects, cabIR })}
          />
        )}
      </EffectSection>
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
