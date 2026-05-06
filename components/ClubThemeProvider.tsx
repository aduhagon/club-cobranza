'use client';

import { useEffect } from 'react';
import { darkenHex, hexToBg } from '@/lib/utils';

interface Props {
  color: string | null;
  children: React.ReactNode;
}

export default function ClubThemeProvider({ color, children }: Props) {
  useEffect(() => {
    if (!color) return;
    const root = document.documentElement;
    root.style.setProperty('--primary', color);
    root.style.setProperty('--primary-dark', darkenHex(color, 18));
    root.style.setProperty('--primary-bg', hexToBg(color, 0.10));
  }, [color]);

  return <>{children}</>;
}
