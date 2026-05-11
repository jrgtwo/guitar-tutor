/**
 * Expanded metronome panel — a draggable floating card. Renders only when the
 * `expandedOpen` flag is on. Position is held in the metronome store and clamped to
 * the viewport.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TIME_SIGNATURES,
  useMetronome,
  useMetronomeStore,
} from '@fretwork/lib';
import { BeatDot } from './BeatDot';
import { ExpandedDragHandle } from './ExpandedDragHandle';
import { useDraggable } from './useDraggable';
import { useBeatFlash } from './useBeatFlash';
import { PlaybackControls } from '../playback/PlaybackControls';
import { SoundControls } from '../playback/SoundControls';

const PANEL_WIDTH = 320;

export function MetronomeExpanded() {
  const expandedOpen = useMetronomeStore((s) => s.expandedOpen);
  const setExpandedOpen = useMetronomeStore((s) => s.setExpandedOpen);
  const position = useMetronomeStore((s) => s.expandedPosition);
  const setPosition = useMetronomeStore((s) => s.setExpandedPosition);

  const m = useMetronome();
  // Pulse the row of dots in lockstep with the compact view: the active beat lights
  // up briefly then fades back to dim before the next beat fires.
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState(160);

  // Measure the panel after mount so the drag clamping uses the real height.
  useEffect(() => {
    if (!panelRef.current) return;
    setPanelHeight(panelRef.current.offsetHeight);
  }, [expandedOpen, m.timeSignature.numerator]);

  // First-open: position the panel at the bottom-right of the viewport (instead of the
  // store's default {24, 24} which would put it top-left).
  const placedRef = useRef(false);
  useEffect(() => {
    if (expandedOpen && !placedRef.current && panelRef.current) {
      const x = window.innerWidth - PANEL_WIDTH - 24;
      const y = window.innerHeight - panelRef.current.offsetHeight - 24;
      setPosition({ x: Math.max(0, x), y: Math.max(0, y) });
      placedRef.current = true;
    }
    if (!expandedOpen) placedRef.current = false;
  }, [expandedOpen, setPosition]);

  const { onPointerDown } = useDraggable({
    position,
    onPositionChange: setPosition,
    width: PANEL_WIDTH,
    height: panelHeight,
  });

  if (!expandedOpen) return null;

  const beatsInMeasure = m.timeSignature.numerator;
  const beats = Array.from({ length: beatsInMeasure }, (_, i) => i);

  return (
    <div
      ref={panelRef}
      className="fixed z-40 rounded-lg border border-border/60 bg-card shadow-2xl shadow-black/40 backdrop-blur"
      style={{ left: position.x, top: position.y, width: PANEL_WIDTH }}
      role="dialog"
      aria-label="Expanded metronome panel"
    >
      <ExpandedDragHandle onClose={() => setExpandedOpen(false)} onPointerDown={onPointerDown} />

      <div className="p-4 flex flex-col gap-4">
        {/* Beat-dot row */}
        <div className="flex items-center justify-center gap-2 py-2">
          {beats.map((b) => (
            <BeatDot
              key={b}
              active={flashing && m.currentBeat === b}
              isAccent={m.accents.includes(b)}
              size="md"
              dimmed={!m.isRunning}
            />
          ))}
        </div>

        {/* Inline controls */}
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant={m.isRunning ? 'default' : 'secondary'}
            className="h-9 px-4 font-mono uppercase tracking-wider text-xs"
            onClick={() => void m.toggle()}
          >
            {m.isRunning ? <Square className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            {m.isRunning ? 'Stop' : 'Start'}
          </Button>

          <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden">
            <button type="button" className="px-2 text-muted-foreground hover:text-foreground" onClick={() => m.setBpm(m.bpm - 1)} aria-label="Decrease BPM">−</button>
            <input
              type="number"
              value={m.bpm}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) m.setBpm(v); }}
              min={40}
              max={240}
              className="w-14 bg-transparent text-center font-mono text-sm focus:outline-none h-full"
              aria-label="BPM"
            />
            <button type="button" className="px-2 text-muted-foreground hover:text-foreground" onClick={() => m.setBpm(m.bpm + 1)} aria-label="Increase BPM">+</button>
            <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input flex items-center h-full">BPM</span>
          </div>

          <Select value={m.timeSignature.id} onValueChange={m.setTimeSignature}>
            <SelectTrigger className="font-mono uppercase tracking-wider text-xs w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_SIGNATURES.map((ts) => (
                <SelectItem key={ts.id} value={ts.id} className="font-mono uppercase tracking-wider text-xs">
                  {ts.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Accent toggle */}
        <div className="flex items-center justify-between border-t border-border/40 pt-3">
          <div className="flex flex-col leading-tight">
            <Label htmlFor="metronome-accent" className="cursor-pointer">Accent</Label>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {m.accentEnabled
                ? `Beats ${m.accents.map((a) => a + 1).join(', ')} louder`
                : 'All beats sound the same'}
            </span>
          </div>
          <Switch
            id="metronome-accent"
            checked={m.accentEnabled}
            onCheckedChange={m.setAccentEnabled}
          />
        </div>

        {/* Tick-sound toggle. Off = silent metronome — beat dots and note playback
         *  still drive the timing, but the click is muted. */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col leading-tight">
            <Label htmlFor="metronome-click" className="cursor-pointer">Tick sound</Label>
            <span className="text-[10px] font-mono text-muted-foreground">
              {m.clickMuted
                ? 'Silent — keep time with the lights or note playback'
                : 'Click on every beat'}
            </span>
          </div>
          <Switch
            id="metronome-click"
            checked={!m.clickMuted}
            onCheckedChange={(on) => m.setClickMuted(!on)}
          />
        </div>

        {/* Playback controls (notes-on-beat) live below the accent toggle. */}
        <PlaybackControls />

        {/* Acoustic / Electric switch for the active fretboard instrument. Hidden
         *  when ukulele is selected (acoustic-only in v1). */}
        <SoundControls />
      </div>
    </div>
  );
}
