/**
 * Docked inspector strip for the single-selected pattern event. Replaces the
 * old bar-anchored NoteInspector popover, which had three drawbacks:
 *   - clipped by the timeline scroll container's `overflow-auto`
 *   - couldn't extend past the viewport edges
 *   - jittered as the user scrolled horizontally
 *
 * This strip lives in document flow between EditorToolbar and PatternTimeline.
 * Renders only when `selectedEventIds.length === 1`. Single horizontal row of
 * grouped, *labeled* controls so the abbreviated dropdown values (mp, ppp,
 * legato, …) are unambiguous even on first encounter.
 *
 * Layout (left → right):
 *   [▼] | Note · str/fret | FRET stepper | LEGATO H/P/Tie | VIBRATO segment |
 *   DYNAMIC select | SLIDE select | BEND select + depth stepper | DELETE
 *
 * Collapse state persists to localStorage `fretwork.note-inspector.collapsed`
 * — matches the convention from the playback ribbon and header card.
 */

import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { PatternEvent, DynamicMark } from '@fretwork/lib';
import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { useCollapseStorage } from '../../header-card/useCollapseStorage';

const DYNAMIC_OPTIONS: DynamicMark[] = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
const DYNAMIC_TO_VELOCITY: Record<DynamicMark, number> = {
  ppp: 0.08, pp: 0.18, p: 0.32, mp: 0.5, mf: 0.65, f: 0.8, ff: 0.92, fff: 1.0,
};

const SLIDE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'legato', label: 'Legato (smooth to next)' },
  { value: 'shift', label: 'Shift (clean to next)' },
  { value: 'slide-in-below', label: 'In from below' },
  { value: 'slide-in-above', label: 'In from above' },
  { value: 'slide-out-down', label: 'Out downward' },
  { value: 'slide-out-up', label: 'Out upward' },
];

const BEND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'bend', label: 'Bend up' },
  { value: 'release', label: 'Release down' },
  { value: 'pre-bend', label: 'Pre-bend (start at peak)' },
  { value: 'bend-release', label: 'Bend then release' },
];

export function NoteInspectorBar() {
  const pattern = usePatternsStore(selectEditingPattern);
  const selectedEventIds = usePatternsStore((s) => s.selectedEventIds);
  const setEventFret = usePatternsStore((s) => s.setEventFret);
  const updateArt = usePatternsStore((s) => s.updateEventArticulations);
  const deleteEvents = usePatternsStore((s) => s.deleteEvents);
  const [collapsed, setCollapsed] = useCollapseStorage('fretwork.note-inspector.collapsed', false);

  // Only render when exactly one event is selected. 0 or N-selected hides the
  // strip entirely so it doesn't eat vertical space with nothing to edit.
  if (!pattern) return null;
  if (selectedEventIds.length !== 1) return null;
  const event = pattern.events.find((e) => e.id === selectedEventIds[0]);
  if (!event) return null;

  return (
    <div className="border border-border/40 bg-charcoal-raised/30 rounded-md">
      {/* Header row: chevron, identity, summary, collapse */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-white/3 transition-colors"
        aria-expanded={!collapsed}
        aria-controls="note-inspector-body"
        aria-label={collapsed ? 'Expand selected-note inspector' : 'Collapse selected-note inspector'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Selected note
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
          string {event.stringIndex + 1} · fret {event.fret}
        </span>
        {collapsed && <ArticulationSummary event={event} />}
      </button>

      {!collapsed && (
        <div
          id="note-inspector-body"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-t border-border/40"
        >
          <FretGroup event={event} onChange={(f) => setEventFret(event.id, f)} />

          <Divider />

          <FieldGroup label="Legato">
            <Pill
              active={!!event.hammerOn}
              onClick={() =>
                updateArt(event.id, { hammerOn: event.hammerOn ? undefined : true })
              }
              label="Hammer"
              title="Hammer-on: this note is reached by tapping the fret without re-plucking"
            />
            <Pill
              active={!!event.pullOff}
              onClick={() =>
                updateArt(event.id, { pullOff: event.pullOff ? undefined : true })
              }
              label="Pull"
              title="Pull-off: this note is reached by releasing a higher fret without re-plucking"
            />
            <Pill
              active={!!event.tap}
              onClick={() =>
                updateArt(event.id, { tap: event.tap ? undefined : true })
              }
              label="Tap"
              title="Left-hand tap: same audible result as a hammer-on but notated differently"
            />
            <Pill
              active={!!event.tieToNext}
              onClick={() =>
                updateArt(event.id, { tieToNext: event.tieToNext ? undefined : true })
              }
              label="Tie"
              title="Tie: this note rings through into the next same-fret event without re-plucking"
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label="Attack">
            <Pill
              active={!!event.palmMute}
              onClick={() =>
                updateArt(event.id, { palmMute: event.palmMute ? undefined : true })
              }
              label="Palm mute"
              title="Palm-mute: shortened, dampened tone (the chug-chug of a muted string)"
            />
            <Pill
              active={!!event.ghost}
              onClick={() =>
                updateArt(event.id, { ghost: event.ghost ? undefined : true })
              }
              label="Ghost"
              title="Ghost note: played softer than surrounding notes, more rhythmic than melodic"
            />
            <Pill
              active={!!event.dead}
              onClick={() =>
                updateArt(event.id, { dead: event.dead ? undefined : true })
              }
              label="Dead"
              title="Dead / muted: percussive 'X' — finger touches the string, no defined pitch"
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label="Harmonic" htmlFor="note-harmonic">
            <Select
              id="note-harmonic"
              value={event.harmonic?.type ?? ''}
              onChange={(value) => {
                if (value === '') {
                  updateArt(event.id, { harmonic: undefined });
                } else {
                  updateArt(event.id, {
                    harmonic: {
                      type: value as 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi',
                      fret: event.harmonic?.fret,
                    },
                  });
                }
              }}
            >
              <option value="">None</option>
              <option value="natural">Natural</option>
              <option value="artificial">Artificial</option>
              <option value="pinch">Pinch</option>
              <option value="tap">Tap harmonic</option>
              <option value="semi">Semi-harmonic</option>
            </Select>
          </FieldGroup>

          <Divider />

          <FieldGroup label="Vibrato">
            <Segment
              value={event.vibrato ?? ''}
              onChange={(v) =>
                updateArt(event.id, {
                  vibrato: v === 'slight' || v === 'wide' ? v : undefined,
                })
              }
              options={[
                { value: '', label: 'None' },
                { value: 'slight', label: 'Slight' },
                { value: 'wide', label: 'Wide' },
              ]}
            />
          </FieldGroup>

          <Divider />

          <FieldGroup label="Dynamic" htmlFor="note-dynamic">
            <Select
              id="note-dynamic"
              value={event.dynamic ?? ''}
              onChange={(value) => {
                if (value === '') {
                  updateArt(event.id, { dynamic: undefined, velocity: undefined });
                } else {
                  const dyn = value as DynamicMark;
                  updateArt(event.id, { dynamic: dyn, velocity: DYNAMIC_TO_VELOCITY[dyn] });
                }
              }}
            >
              <option value="">None</option>
              {DYNAMIC_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d.toUpperCase()}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <Divider />

          <FieldGroup label="Slide" htmlFor="note-slide">
            <Select
              id="note-slide"
              value={event.slide?.type ?? ''}
              onChange={(value) => {
                if (value === '') {
                  updateArt(event.id, { slide: undefined });
                } else {
                  updateArt(event.id, {
                    slide: { type: value as NonNullable<PatternEvent['slide']>['type'] },
                  });
                }
              }}
            >
              {SLIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <Divider />

          <FieldGroup label="Bend" htmlFor="note-bend">
            <Select
              id="note-bend"
              value={event.bend?.type ?? ''}
              onChange={(value) => {
                if (value === '') {
                  updateArt(event.id, { bend: undefined });
                } else {
                  updateArt(event.id, {
                    bend: {
                      type: value as NonNullable<PatternEvent['bend']>['type'],
                      semitones: event.bend?.semitones ?? 1,
                    },
                  });
                }
              }}
            >
              {BEND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {event.bend && (
              <BendDepthStepper
                value={event.bend.semitones}
                onChange={(s) =>
                  event.bend &&
                  updateArt(event.id, { bend: { ...event.bend, semitones: s } })
                }
              />
            )}
          </FieldGroup>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => deleteEvents([event.id])}
            className="h-7 px-2 inline-flex items-center gap-1 rounded border border-red-500/40 hover:bg-red-500/10 text-red-300 text-[11px] font-mono uppercase tracking-wider"
            aria-label="Delete selected note"
            title="Delete this note (⌫)"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FretGroup({
  event,
  onChange,
}: {
  event: PatternEvent;
  onChange: (fret: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor="note-fret">Fret</Label>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, event.fret - 1))}
        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        aria-label="Decrement fret"
      >
        −
      </button>
      <input
        id="note-fret"
        type="number"
        min={0}
        value={event.fret}
        onChange={(e) => {
          const v = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 0) onChange(v);
        }}
        className="h-7 w-12 px-1 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/80 font-mono text-sm font-semibold"
      />
      <button
        type="button"
        onClick={() => onChange(event.fret + 1)}
        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        aria-label="Increment fret"
      >
        +
      </button>
    </div>
  );
}

function FieldGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
    >
      {children}
    </label>
  );
}

function Divider() {
  return <div className="h-5 w-px bg-border/40 self-center" aria-hidden />;
}

function Pill({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={
        'h-7 px-2 rounded text-[11px] font-mono font-semibold transition-colors ' +
        (active
          ? 'bg-degree-root/40 text-foreground border border-degree-root/60'
          : 'bg-charcoal-deep/40 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-white/5')
      }
    >
      {label}
    </button>
  );
}

function Segment({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded border border-border/60 overflow-hidden">
      {options.map((o, idx) => {
        const isActive = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(o.value)}
            className={
              'h-7 px-2 text-[11px] font-mono transition-colors ' +
              (idx > 0 ? 'border-l border-border/60 ' : '') +
              (isActive
                ? 'bg-degree-root/30 text-foreground'
                : 'bg-charcoal-deep/40 text-muted-foreground hover:bg-white/5 hover:text-foreground')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id?: string;
  value: string;
  onChange(v: string): void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-xs font-mono text-foreground outline-none focus:border-degree-root/80"
    >
      {children}
    </select>
  );
}

function BendDepthStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (semitones: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 ml-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0.5, value - 0.5))}
        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        aria-label="Decrease bend depth by half-step"
      >
        −
      </button>
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground min-w-[42px] text-center">
        {value.toFixed(1)}st
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(6, value + 0.5))}
        className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        aria-label="Increase bend depth by half-step"
      >
        +
      </button>
    </div>
  );
}

function ArticulationSummary({ event }: { event: PatternEvent }) {
  // Compact summary chips for the collapsed header so the user still has a
  // hint of what articulations are active without expanding the strip.
  const tags: string[] = [];
  if (event.hammerOn) tags.push('H');
  if (event.pullOff) tags.push('P');
  if (event.tap) tags.push('Tap');
  if (event.tieToNext) tags.push('Tie');
  if (event.palmMute) tags.push('PM');
  if (event.ghost) tags.push('Ghost');
  if (event.dead) tags.push('Dead');
  if (event.harmonic) tags.push(`Harm·${event.harmonic.type}`);
  if (event.vibrato) tags.push(`Vib·${event.vibrato}`);
  if (event.dynamic) tags.push(event.dynamic);
  if (event.slide) tags.push('Slide');
  if (event.bend) tags.push(`Bend ${event.bend.semitones.toFixed(1)}st`);
  if (tags.length === 0) return null;
  return (
    <span className="text-[10px] font-mono text-muted-foreground/80 ml-2">
      {tags.join(' · ')}
    </span>
  );
}
