interface ForkedFromProps {
  creatorName: string | null;
}

/** Small attribution badge shown when an item was forked from another user's
 *  shared content. Mounted inside the header card on both pages. */
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
