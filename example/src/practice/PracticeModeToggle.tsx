import { BookOpen, Music2 } from 'lucide-react';

export type PracticeMode = 'theory' | 'pattern';

/**
 * The Practice page's spine: a segmented toggle between Theory mode (explore a
 * named scale/arp/chord on the fretboard) and Pattern mode (play a piece and
 * watch it light up on the neck). Determines which control set is active and
 * what drives the fretboard.
 */
export function PracticeModeToggle({
  mode,
  onChange,
}: {
  mode: PracticeMode;
  onChange: (mode: PracticeMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Practice mode"
      className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-charcoal-raised/50 p-1"
    >
      <ModeButton
        active={mode === 'theory'}
        onClick={() => onChange('theory')}
        icon={<BookOpen size={13} />}
        label="Theory"
      />
      <ModeButton
        active={mode === 'pattern'}
        onClick={() => onChange('pattern')}
        icon={<Music2 size={13} />}
        label="Pattern"
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors ' +
        (active
          ? 'bg-degree-root/15 text-degree-root border border-degree-root/40'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent')
      }
    >
      {icon}
      {label}
    </button>
  );
}
