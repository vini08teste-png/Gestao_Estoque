import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gestão de EPIs | Grupo TSA", template: "%s | Gestão de EPIs" },
  description: "Sistema interno de gestão de EPIs do Grupo TSA.",
  robots: { index: false, follow: false },
  icons: { icon: { url: "/favicon-tsa.png", type: "image/png", sizes: "64x64" } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
