import type { Variant } from '@fretwork/lib';

interface Props {
  variant: Variant;
  isActive: boolean;
  allowMutations: boolean;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
}

export function VoiceVariantRow({
  variant,
  isActive,
  allowMutations,
  onRename,
  onDelete,
  onMove,
}: Props) {
  return (
    <div
      className={`group flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-accent ${isActive ? 'bg-degree-root/15' : ''}`}
    >
      <span className="w-2 text-degree-root">{isActive ? '●' : ''}</span>
      <span className="flex-1 truncate">{variant.name}</span>
      <span className="text-[10px] text-muted-foreground/60">{variant.family}</span>
      {allowMutations && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            ✎
          </button>
          <button
            type="button"
            title="Move to folder"
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            ↪
          </button>
          <button
            type="button"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
