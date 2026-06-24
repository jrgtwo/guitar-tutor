import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdsProvider } from '../src/AdsProvider';
import { AdSlot } from '../src/AdSlot';
import { createEthicalAdsProvider } from '../src/providers/ethicalAds';
import type { AdsConfig } from '../src/types';

describe('EthicalAds provider', () => {
  it('renders a placement div with the configured publisher + per-slot attrs', () => {
    const config: AdsConfig = {
      provider: createEthicalAdsProvider({ publisher: 'test-pub', defaultClasses: ['dark'] }),
      slots: { footer: { eaType: 'text', eaClasses: ['horizontal'] } },
    };
    const { container } = render(
      <AdsProvider config={config}>
        <AdSlot slot="footer" />
      </AdsProvider>,
    );
    const el = container.querySelector('[data-ea-publisher="test-pub"]');
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('data-ea-type', 'text');
    expect(el).toHaveClass('horizontal');
  });

  it('injects the EthicalAds client script once on mount', () => {
    const config: AdsConfig = {
      provider: createEthicalAdsProvider({ publisher: 'p' }),
      slots: { footer: {} },
    };
    render(
      <AdsProvider config={config}>
        <AdSlot slot="footer" />
      </AdsProvider>,
    );
    const scripts = document.querySelectorAll('#adkit-ethicalads-script');
    expect(scripts.length).toBe(1);
  });
});
