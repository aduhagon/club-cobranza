import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cobranza Club',
  description: 'Sistema de cobro de cuotas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
