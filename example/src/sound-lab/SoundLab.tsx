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
  VOICE_PRESETS,
  MasterBus,
  DEFAULT_REVERB_SETTINGS,
  startAudio,
  loadOverrides,
  saveOverrides,
  clearPresetOverride,
  clearAllOverrides,
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
} from '@fretwork/lib';
import { ParameterSlider } from './ParameterSlider';
import { AuditionDeck } from './AuditionDeck';

const OSCILLATOR_TYPES: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const CHORUS_TYPES: ChorusType[] = ['sine', 'square', 'sawtooth', 'triangle'];
const OVERSAMPLE_OPTIONS: DistortionOversample[] = ['none', '2x', '4x'];

export function SoundLab() {
  // Hydrate from localStorage on mount: any preset that has an override is used in
  // place of the shipped default. Same for reverb.
  const [presets, setPresets] = useState<VoicePreset[]>(() => {
    const overrides = loadOverrides();
    return VOICE_PRESETS.map((p) => overrides.presets[p.id] ?? { ...p });
  });
  const [activeId, setActiveId] = useState<string>(presets[0].id);
  const [testNote, setTestNote] = useState<string>('A3');
  const [reverb, setReverb] = useState<ReverbSettings>(() => {
    const overrides = loadOverrides();
    return overrides.reverb ?? DEFAULT_REVERB_SETTINGS;
  });
  const [copied, setCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Debounced auto-save: every change schedules a write 200ms in the future,
  // resetting the timer if more changes come in. Avoids hammering localStorage on
  // slider drags. The example app reacts to writes via the override-changed event.
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const presetMap: Record<string, VoicePreset> = {};
      // Only store presets that differ from shipped defaults — reduces storage bloat
      // and lets users selectively reset.
      for (const preset of presets) {
        const shipped = VOICE_PRESETS.find((p) => p.id === preset.id);
        if (!shipped || JSON.stringify(preset) !== JSON.stringify(shipped)) {
          presetMap[preset.id] = preset;
        }
      }
      saveOverrides({
        schemaVersion: 1,
        presets: presetMap,
        reverb: JSON.stringify(reverb) === JSON.stringify(DEFAULT_REVERB_SETTINGS) ? undefined : reverb,
      });
    }, 200);
    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    };
  }, [presets, reverb]);

  const activePreset = presets.find((p) => p.id === activeId) ?? presets[0];

  // Voice is held in STATE (not a ref) so that downstream components — notably
  // AuditionDeck — re-render with a non-null voice prop after the rebuild effect
  // runs on mount. With useRef the change wasn't reactive, which silently
  // swallowed every audition click on a fresh page load until something else
  // (e.g. switching instruments) triggered a re-render.
  const [voice, setVoice] = useState<Voice | null>(null);

  // Rebuild on preset id or source kind change. Parameter tweaks happen in place.
  useEffect(() => {
    const v = new Voice(activePreset);
    setVoice(v);
    return () => {
      v.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activePreset.source.kind]);

  // Live-mutate the voice on every parameter change.
  useEffect(() => {
    if (!voice) return;
    if (activePreset.source.kind === 'pluck-synth' || activePreset.source.kind === 'fm-synth') {
      voice.updateSynthParams(activePreset.source.params);
    }
    voice.updateLayer(activePreset.layer);
    voice.updateLevel(activePreset.level);
    voice.updateBodyFilter(activePreset.bodyFilter);
    voice.updateCompressor(activePreset.compressor);
    voice.updateEffects(activePreset.effects);
  }, [voice, activePreset]);

  useEffect(() => {
    MasterBus.setReverbSettings(reverb);
  }, [reverb]);

  // First-gesture warmup. Browser autoplay policy requires a user gesture before
  // we can resume the AudioContext. Catching the user's very first click anywhere
  // on the page lets us start Tone and pre-build the master bus (including the
  // reverb's impulse-response generation) BEFORE the audition buttons fire,
  // eliminating the race that produced "no audio until I change instruments".
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
        // Defensive — warmup is best-effort. If it throws, the audition buttons
        // will still call startAudio() themselves.
      }
    };
    window.addEventListener('pointerdown', onFirstGesture, true);
    window.addEventListener('keydown', onFirstGesture, true);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
    };
  }, []);

  const updateActive = (patch: (p: VoicePreset) => VoicePreset) => {
    setPresets((all) => all.map((p) => (p.id === activeId ? patch(p) : p)));
  };

  const settingsJson = useMemo(() => {
    return JSON.stringify({ preset: activePreset, reverb }, null, 2);
  }, [activePreset, reverb]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(settingsJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail under insecure contexts; silent fallback.
    }
  };

  const resetActiveToDefault = () => {
    const orig = VOICE_PRESETS.find((p) => p.id === activeId);
    if (!orig) return;
    setPresets((all) => all.map((p) => (p.id === activeId ? { ...orig } : p)));
    clearPresetOverride(activeId);
  };

  const resetAll = () => {
    if (!window.confirm('Reset all presets and reverb to shipped defaults? This clears your saved overrides.')) {
      return;
    }
    setPresets(VOICE_PRESETS.map((p) => ({ ...p })));
    setReverb(DEFAULT_REVERB_SETTINGS);
    clearAllOverrides();
  };

  const exportAll = () => {
    const presetMap: Record<string, VoicePreset> = {};
    for (const preset of presets) {
      const shipped = VOICE_PRESETS.find((p) => p.id === preset.id);
      if (!shipped || JSON.stringify(preset) !== JSON.stringify(shipped)) {
        presetMap[preset.id] = preset;
      }
    }
    const payload = JSON.stringify(
      {
        schemaVersion: 1,
        presets: presetMap,
        reverb: JSON.stringify(reverb) === JSON.stringify(DEFAULT_REVERB_SETTINGS) ? undefined : reverb,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fretwork-presets-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const performImport = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importText);
      if (parsed?.schemaVersion !== 1) {
        throw new Error('Schema version mismatch (expected 1).');
      }
      const incomingPresets = (parsed.presets ?? {}) as Record<string, VoicePreset>;
      setPresets((all) =>
        all.map((p) => incomingPresets[p.id] ?? { ...(VOICE_PRESETS.find((s) => s.id === p.id) ?? p) }),
      );
      if (parsed.reverb) setReverb(parsed.reverb);
      setImportOpen(false);
      setImportText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse JSON.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-charcoal-raised/70 backdrop-blur px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">Sound Lab</h1>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          Tune voice presets · /?lab=1
        </span>
        <div className="ml-auto flex items-center gap-2">
          <a href="/" className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
            ← Back to app
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Preset picker */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
                Preset
              </Label>
              <select
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="h-9 px-3 rounded-md bg-card border border-input font-mono text-xs"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                {activePreset.instrumentId} · {activePreset.family}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Button size="sm" variant="ghost" onClick={resetActiveToDefault}>
                Reset preset
              </Button>
              <Button size="sm" variant="ghost" onClick={exportAll}>
                Export
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen((o) => !o)}>
                Import
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAll}>
                Reset all
              </Button>
            </div>
          </div>

          <p className="text-[10px] font-mono text-muted-foreground/70">
            Tweaks save automatically to <code className="text-foreground/80">localStorage</code> and
            take effect in the main app on its next render. Use Export / Import to back up
            or share between browsers.
          </p>

          {importOpen && (
            <div className="space-y-2 border border-border/30 rounded-md p-3">
              <Label className="text-xs">Paste exported JSON here</Label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                className="w-full text-[11px] font-mono p-2 bg-charcoal-deep/60 border border-border/30 rounded"
                placeholder='{ "schemaVersion": 1, "presets": { ... } }'
              />
              {importError && (
                <p className="text-[11px] text-destructive">Import failed: {importError}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={performImport}>
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setImportOpen(false);
                    setImportText('');
                    setImportError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <AuditionDeck voice={voice} testNote={testNote} setTestNote={setTestNote} />
        </section>

        {/* Synth parameters */}
        <Section title={`Synth (${activePreset.source.kind})`}>
          {activePreset.source.kind === 'pluck-synth' && (
            <PluckSynthControls
              params={activePreset.source.params}
              onChange={(params) =>
                updateActive((p) => ({ ...p, source: { kind: 'pluck-synth', params } }))
              }
            />
          )}
          {activePreset.source.kind === 'fm-synth' && (
            <FMSynthControls
              params={activePreset.source.params}
              onChange={(params) =>
                updateActive((p) => ({ ...p, source: { kind: 'fm-synth', params } }))
              }
            />
          )}
        </Section>

        {/* Sub-body layer (optional second synth mixed underneath) */}
        <Section title="Sub-body layer">
          <ToggleableBlock
            enabled={!!activePreset.layer}
            onToggle={(on) =>
              updateActive((p) => ({
                ...p,
                layer: on ? defaultLayerForKind(p.source.kind) : undefined,
              }))
            }
            label="Layer on"
          >
            {activePreset.layer && (
              <LayerControls
                layer={activePreset.layer}
                onChange={(layer) => updateActive((p) => ({ ...p, layer }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        {/* Voice level (always-on) */}
        <Section title="Voice level">
          <VoiceLevelControls
            level={activePreset.level}
            onChange={(level) => updateActive((p) => ({ ...p, level }))}
          />
        </Section>

        {/* Optional shaping blocks */}
        <Section title="Body filter">
          <ToggleableBlock
            enabled={!!activePreset.bodyFilter}
            onToggle={(on) =>
              updateActive((p) => ({
                ...p,
                bodyFilter: on ? { cutoff: 3000, q: 0.7 } : undefined,
              }))
            }
            label="Lowpass on"
          >
            {activePreset.bodyFilter && (
              <BodyFilterControls
                params={activePreset.bodyFilter}
                onChange={(bodyFilter) => updateActive((p) => ({ ...p, bodyFilter }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        <Section title="Compressor">
          <ToggleableBlock
            enabled={!!activePreset.compressor}
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
            {activePreset.compressor && (
              <CompressorControls
                params={activePreset.compressor}
                onChange={(compressor) => updateActive((p) => ({ ...p, compressor }))}
              />
            )}
          </ToggleableBlock>
        </Section>

        {/* Effects (now always available regardless of family — lab is exploratory) */}
        <Section title="Effects">
          <EffectControls
            effects={activePreset.effects ?? {}}
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
              checked={reverb.enabled}
              onCheckedChange={(enabled) => setReverb((r) => ({ ...r, enabled }))}
            />
          </div>
          <ParameterSlider
            label="Decay"
            value={reverb.decay}
            min={0.1}
            max={6}
            step={0.05}
            unit="s"
            onChange={(decay) => setReverb((r) => ({ ...r, decay }))}
          />
          <ParameterSlider
            label="Pre-delay"
            value={reverb.preDelay}
            min={0}
            max={0.2}
            step={0.005}
            unit="s"
            precision={3}
            onChange={(preDelay) => setReverb((r) => ({ ...r, preDelay }))}
          />
          <ParameterSlider
            label="Wet"
            value={reverb.wet}
            min={0}
            max={1}
            step={0.01}
            onChange={(wet) => setReverb((r) => ({ ...r, wet }))}
          />
        </Section>

        {/* JSON readout */}
        <section className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
              Settings JSON
            </h2>
            <Button size="sm" variant="secondary" onClick={copyJson}>
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
          <pre className="text-[11px] font-mono leading-relaxed bg-charcoal-deep/60 border border-border/30 rounded p-3 overflow-x-auto max-h-[420px]">
            {settingsJson}
          </pre>
        </section>
      </main>
    </div>
  );
}

// ─── Section + helpers ────────────────────────────────────────────────────────

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
    </>
  );
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
