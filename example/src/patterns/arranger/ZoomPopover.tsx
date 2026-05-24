/**
 * Combined zoom popover for the composition arranger. One trigger in the
 * toolbar opens a panel with two discrete sliders (Bar width / Track height)
 * and a Fit-to-window button. Replaces the previous inline cluster of eight
 * controls that read as two near-identical magnifier groups.
 */
import { ZoomIn, ChevronDown, Maximize2 } from 'lucide-react';
import { useArrangerView } from './ArrangerViewContext';
import { ZOOM_LEVELS, LANE_HEIGHTS } from './timeline-math';
import { SimplePopover } from '../../components/ui/SimplePopover';

export function ZoomPopover() {
  const {
    pxPerBeat,
    zoomIndex,
    setZoomIndex,
    laneHeight,
    vZoomIndex,
    setVZoomIndex,
  } = useArrangerView();

  return (
    <SimplePopover
      align="end"
      panelClassName="p-3 w-64"
      trigger={
        <button
          type="button"
          className="h-6 px-2 inline-flex items-center gap-1 rounded border border-border/60 text-muted-foreground hover:bg-white/5 text-[10px] font-mono uppercase tracking-wider"
          aria-label="Zoom controls"
        >
          <ZoomIn size={11} /> Zoom <ChevronDown size={10} />
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <SliderRow
          label="Bar width"
          value={zoomIndex}
          max={ZOOM_LEVELS.length - 1}
          display={`${pxPerBeat}px/♩`}
          onChange={setZoomIndex}
        />
        <SliderRow
          label="Track height"
          value={vZoomIndex}
          max={LANE_HEIGHTS.length - 1}
          display={`${laneHeight}px`}
          onChange={setVZoomIndex}
        />
        <button
          type="button"
          onClick={() => setZoomIndex(0)}
          className="h-7 px-2 inline-flex items-center justify-center gap-1 rounded border border-border/60 text-muted-foreground hover:bg-white/5 text-[10px] font-mono uppercase tracking-wider"
        >
          <Maximize2 size={10} /> Fit to window
        </button>
      </div>
    </SimplePopover>
  );
}

function SliderRow({
  label,
  value,
  max,
  display,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="flex-1 accent-current"
        aria-label={label}
      />
      <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-16 text-right">
        {display}
      </span>
    </div>
  );
}
