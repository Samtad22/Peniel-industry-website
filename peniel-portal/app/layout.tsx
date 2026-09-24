import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Archivo is the design system's only typeface (headings and body).
// Self-hosted, so the portal never depends on Google Fonts being reachable.
const archivo = localFont({
  src: [
    { path: "../fonts/archivo-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/archivo-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/archivo-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Peniel Portal", template: "%s | Peniel Portal" },
  description: "Order, track and approve crown corks with Peniel Industry PLC.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
