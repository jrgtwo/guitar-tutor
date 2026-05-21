/**
 * PatternMetadataControls — ribbon-row-level controls extracted from the
 * former ItemMetadataPanel. Each export is a self-contained control (or small
 * control group) intended to be rendered as a single element inside a
 * `RibbonSection.controls` array.
 *
 * Extracted because their JSX exceeds the ~40-line inline threshold set in
 * the plans doc. Simpler controls (Key, Scale, Difficulty selects) remain
 * inline in `patternsSetupRibbonSections.tsx`.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, Trash2 } from 'lucide-react';
import {
  ControlGroup,
  DESCRIPTION_MAX_LENGTH,
  RadioGroup,
  RadioGroupItem,
  VISIBILITIES,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
} from '@fretwork/lib';
import type { Composition, Pattern } from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { PatternPickerPanel } from './PatternPickerPanel';
import { CompositionPickerPanel } from './CompositionPickerPanel';
import { DeleteItemDialog } from './DeleteItemDialog';

// ── Item name + Switch button ─────────────────────────────────────────────────

interface NameSwitchProps {
  kind: 'pattern' | 'composition';
  nameDraft: string;
  onNameChange: (v: string) => void;
  onNameCommit: () => void;
  onNameEscape: () => void;
}

/** Name input + Switch-to-picker button. Rendered as a single ribbon control. */
export function NameSwitchControl({
  kind,
  nameDraft,
  onNameChange,
  onNameCommit,
  onNameEscape,
}: NameSwitchProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      className="h-9 px-2.5 inline-flex items-center gap-1 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      aria-label={`Switch to a different ${kind}`}
    >
      Switch
      <ChevronRight size={12} />
    </button>
  );

  return (
    <ControlGroup label="Name">
      <div className="flex items-stretch gap-1.5">
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onNameCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              onNameEscape();
              e.currentTarget.blur();
            }
          }}
          className="w-48 h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          placeholder="Untitled"
        />
        <SimplePopover
          trigger={trigger}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          align="start"
          panelClassName="w-[min(720px,calc(100vw-2rem))] p-0"
        >
          {kind === 'composition' ? (
            <CompositionPickerPanel
              onBack={() => setPickerOpen(false)}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <PatternPickerPanel
              onBack={() => setPickerOpen(false)}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </SimplePopover>
      </div>
    </ControlGroup>
  );
}

// ── Forked-from attribution ───────────────────────────────────────────────────

interface ForkedFromProps {
  creatorName: string | null;
}

/** Small attribution badge shown when the item was forked. Rendered inline in
 *  the Identity row; only mounted when `forkedFromId !== null`. */
export function ForkedFromBadge({ creatorName }: ForkedFromProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        Forked from
      </span>
      {creatorName ? (
        <span className="text-foreground truncate">{creatorName}</span>
      ) : (
        <span className="text-muted-foreground">[Deleted User]</span>
      )}
    </div>
  );
}

// ── Description textarea ──────────────────────────────────────────────────────

interface DescriptionProps {
  itemId: string;
  descriptionDraft: string;
  onDescriptionChange: (v: string) => void;
  onDescriptionCommit: () => void;
}

/** Description textarea + char counter, laid out inline so it flows with the
 *  rest of the ribbon row. */
export function DescriptionControl({
  itemId,
  descriptionDraft,
  onDescriptionChange,
  onDescriptionCommit,
}: DescriptionProps) {
  return (
    <ControlGroup label="Description">
      <div className="inline-flex items-end gap-1.5">
        <textarea
          id={`desc-${itemId}`}
          value={descriptionDraft}
          onChange={(e) => onDescriptionChange(e.target.value)}
          onBlur={onDescriptionCommit}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={1}
          placeholder="What is this pattern?"
          className="w-72 h-9 px-3 py-1.5 rounded-md border border-input bg-card text-sm shadow-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums pb-2">
          {descriptionDraft.length}/{DESCRIPTION_MAX_LENGTH}
        </span>
      </div>
    </ControlGroup>
  );
}

// ── Visibility radio ──────────────────────────────────────────────────────────

interface VisibilityProps {
  item: Pattern | Composition;
  onSetMeta: (patch: { visibility: string }) => void;
}

/** Visibility radio group (private / unlisted / public). Inline label-left
 *  layout to flow with the rest of the ribbon row; option descriptions move
 *  to the radio's title attribute (tooltip on hover) to keep the row compact. */
export function VisibilityRadio({ item, onSetMeta }: VisibilityProps) {
  return (
    <ControlGroup label="Visibility">
      <RadioGroup
        value={item.visibility}
        onValueChange={(v) => onSetMeta({ visibility: v })}
        className="flex items-center gap-3"
      >
        {VISIBILITIES.map((v) => (
          <label
            key={v}
            htmlFor={`vis-${item.id}-${v}`}
            className="flex items-center gap-1.5 cursor-pointer text-sm"
            title={VISIBILITY_DESCRIPTIONS[v]}
          >
            <RadioGroupItem id={`vis-${item.id}-${v}`} value={v} />
            <span>{VISIBILITY_LABELS[v]}</span>
          </label>
        ))}
      </RadioGroup>
    </ControlGroup>
  );
}

// ── Share link ────────────────────────────────────────────────────────────────

interface ShareLinkProps {
  kind: 'pattern' | 'composition';
  id: string;
}

/** Read-only URL input + copy button. Only rendered when `visibility !== 'private'`. */
export function ShareLinkControl({ kind, id }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const key = kind === 'pattern' ? 'pattern' : 'composition';
    return `${window.location.origin}/?${key}=${id}`;
  }, [kind, id]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('[ShareLinkControl] clipboard write failed', e);
    }
  };

  return (
    <ControlGroup label="Share link">
      <div className="inline-flex items-stretch gap-1.5">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-64 h-9 px-3 rounded-md border border-input bg-card text-xs font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
        <button
          type="button"
          onClick={onCopy}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </ControlGroup>
  );
}

// ── Delete button ─────────────────────────────────────────────────────────────

interface DeleteControlProps {
  item: Pattern | Composition;
  kind: 'pattern' | 'composition';
}

/** Delete button that opens the confirmation dialog. Self-contained: manages
 *  its own dialog open state, calls the store action directly on confirm. After
 *  deletion the store's `ensureEditingPattern` effect will auto-seed a new
 *  item, so no external `onConfirmed` callback is needed. */
export function DeleteControl({ item, kind }: DeleteControlProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 text-red-300 text-xs font-mono uppercase tracking-wider hover:bg-red-500/15 transition-colors"
      >
        <Trash2 size={12} /> Delete {kind}
      </button>
      <DeleteItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kind={kind}
        id={item.id}
        name={item.name}
        visibility={item.visibility}
        onConfirmed={() => setDialogOpen(false)}
      />
    </>
  );
}
