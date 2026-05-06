import "./globals.css";

export const metadata = {
  title: "Cobranza del Club",
  description: "Sistema de cobranza de cuotas sociales"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
