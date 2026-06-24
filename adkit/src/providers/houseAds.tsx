import type { AdProvider, AdSlotConfig, AdSlotId } from '../types';

/** A self-served promo (cross-promote your own apps, a support link, etc.). */
export interface HouseAd {
  /** Headline / promo text. */
  text: string;
  /** Optional secondary line. */
  subtext?: string;
  /** Optional leading image (small, square works best). */
  imageUrl?: string;
  /** Click-through URL — opened in a new tab. */
  href?: string;
  /** Call-to-action label, e.g. "Get it". */
  cta?: string;
}

export interface HouseAdProviderConfig {
  /** Used for any slot that doesn't supply its own `houseAd`. */
  fallback?: HouseAd;
  /** Small label shown to disclose the placement (default "Ad"). Pass '' to hide. */
  label?: string;
}

/**
 * The house/placeholder ad provider — renders immediately, needs no network or
 * approval. Each slot's config may carry a `houseAd: HouseAd`; otherwise the
 * provider falls back to `config.fallback`.
 *
 * Styling is intentionally minimal + inline so the package stays style-agnostic
 * (no Tailwind/token reliance). Apps restyle via the `<AdSlot className>` wrapper.
 */
export function createHouseAdProvider(config: HouseAdProviderConfig = {}): AdProvider {
  const label = config.label ?? 'Ad';
  return {
    id: 'house',
    renderSlot(_slotId: AdSlotId, slotConfig: AdSlotConfig) {
      const ad = (slotConfig.houseAd as HouseAd | undefined) ?? config.fallback;
      if (!ad) return null;
      return <HouseAdCard ad={ad} label={label} />;
    },
  };
}

function HouseAdCard({ ad, label }: { ad: HouseAd; label: string }) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        border: '1px solid rgba(127,127,127,0.25)',
        borderRadius: 10,
        font: '500 13px/1.3 ui-sans-serif, system-ui, sans-serif',
        color: 'inherit',
        textDecoration: 'none',
        position: 'relative',
      }}
    >
      {label ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: 0.5,
          }}
        >
          {label}
        </span>
      ) : null}
      {ad.imageUrl ? (
        <img
          src={ad.imageUrl}
          alt=""
          width={40}
          height={40}
          style={{ borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }}
        />
      ) : null}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{ad.text}</span>
        {ad.subtext ? <span style={{ opacity: 0.7, fontSize: 12 }}>{ad.subtext}</span> : null}
      </span>
      {ad.cta ? (
        <span
          style={{
            marginLeft: 'auto',
            flex: '0 0 auto',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid currentColor',
            opacity: 0.9,
          }}
        >
          {ad.cta}
        </span>
      ) : null}
    </div>
  );

  if (!ad.href) return inner;
  return (
    <a
      href={ad.href}
      target="_blank"
      rel="noreferrer noopener"
      style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
    >
      {inner}
    </a>
  );
}
