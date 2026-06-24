import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AdsProvider } from '../src/AdsProvider';
import { AdSlot } from '../src/AdSlot';
import { createHouseAdProvider } from '../src/providers/houseAds';
import { createEntitlementStore } from '../src/store';
import type { AdsConfig } from '../src/types';

function houseConfig(): AdsConfig {
  return {
    provider: createHouseAdProvider(),
    slots: { footer: { houseAd: { text: 'Try MetroX', cta: 'Get it' } } },
  };
}

describe('<AdSlot>', () => {
  it('renders the configured house ad', () => {
    const store = createEntitlementStore({ storage: null });
    render(
      <AdsProvider config={houseConfig()} store={store}>
        <AdSlot slot="footer" hideWhenEntitled="removeAds" />
      </AdsProvider>,
    );
    expect(screen.getByText('Try MetroX')).toBeInTheDocument();
  });

  it('hides immediately when the entitlement is granted (growth seam)', () => {
    const store = createEntitlementStore({ storage: null });
    render(
      <AdsProvider config={houseConfig()} store={store}>
        <AdSlot slot="footer" hideWhenEntitled="removeAds" />
      </AdsProvider>,
    );
    expect(screen.getByText('Try MetroX')).toBeInTheDocument();

    act(() => store.grant('removeAds'));
    expect(screen.queryByText('Try MetroX')).not.toBeInTheDocument();

    act(() => store.revoke('removeAds'));
    expect(screen.getByText('Try MetroX')).toBeInTheDocument();
  });

  it('renders nothing for an unconfigured slot without throwing', () => {
    const store = createEntitlementStore({ storage: null });
    const { container } = render(
      <AdsProvider config={{ provider: createHouseAdProvider(), slots: {} }} store={store}>
        <AdSlot slot="missing" />
      </AdsProvider>,
    );
    expect(container.querySelector('[data-adkit-slot]')).toBeNull();
  });
});
