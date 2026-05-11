import type { NavVariant } from './useNavVariant';

const LABELS: Record<NavVariant, string> = {
  a: 'A · Clusters',
  b: 'B · Chip+Sheet',
  c: 'C · Tabs',
  d: 'D · Sidebar',
  e: 'E · Palette',
  f: 'F · Header Expand',
};

const ORDER: ReadonlyArray<NavVariant> = ['a', 'b', 'c', 'd', 'e', 'f'];

type Props = {
  variant: NavVariant;
  setVariant: (v: NavVariant) => void;
};

export function VariantSwitcher({ variant, setVariant }: Props) {
  if (!import.meta.env.DEV) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1 px-1.5 py-1 rounded-full bg-charcoal-deep/85 backdrop-blur border border-border/60 shadow-lg text-[10px] font-mono uppercase tracking-wider"
      role="group"
      aria-label="Navigation variant switcher (dev only)"
    >
      {ORDER.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setVariant(v)}
          title={LABELS[v]}
          aria-pressed={v === variant}
          className={
            v === variant
              ? 'h-6 w-6 rounded-full bg-degree-root text-charcoal-deep font-bold'
              : 'h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5'
          }
        >
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
