import type { ReactNode } from 'react';
import { useNavVariant } from './useNavVariant';
import { VariantSwitcher } from './VariantSwitcher';
import { VariantAClusters } from './variants/VariantA-Clusters';
import { VariantBChipSheet } from './variants/VariantB-ChipSheet';
import { VariantCTabs } from './variants/VariantC-Tabs';
import { VariantDSidebar } from './variants/VariantD-Sidebar';
import { VariantEPalette } from './variants/VariantE-Palette';
import { VariantFHeaderExpand } from './variants/VariantF-HeaderExpand';

type Props = { children: ReactNode };

export function NavShell({ children }: Props) {
  const { variant, setVariant } = useNavVariant();

  let content: ReactNode;
  switch (variant) {
    case 'a': content = <VariantAClusters>{children}</VariantAClusters>; break;
    case 'b': content = <VariantBChipSheet>{children}</VariantBChipSheet>; break;
    case 'c': content = <VariantCTabs>{children}</VariantCTabs>; break;
    case 'd': content = <VariantDSidebar>{children}</VariantDSidebar>; break;
    case 'e': content = <VariantEPalette>{children}</VariantEPalette>; break;
    case 'f': content = <VariantFHeaderExpand>{children}</VariantFHeaderExpand>; break;
  }

  return (
    <>
      {content}
      <VariantSwitcher variant={variant} setVariant={setVariant} />
    </>
  );
}
