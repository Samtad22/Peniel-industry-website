import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { COMPANY, SITE_URL } from "@/lib/constants";

// Self-hosted (not next/font/google) so the site has zero runtime dependency
// on Google Fonts being reachable — files are the same static weights,
// sourced via the @fontsource packages at build time.
const poppins = localFont({
  src: [
    { path: "../fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/poppins-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});
const inter = localFont({
  src: [
    { path: "../fonts/inter-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/inter-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/inter-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/inter-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = localFont({
  src: [{ path: "../fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" }],
  variable: "--font-plex-mono",
  display: "swap",
});
const baloo = localFont({
  src: [
    { path: "../fonts/baloo-2-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/baloo-2-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-baloo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${COMPANY.legalName} | Crown Cork Manufacturer, Ethiopia`,
    template: `%s | ${COMPANY.legalName}`,
  },
  description: COMPANY.tagline,
  openGraph: {
    type: "website",
    siteName: COMPANY.legalName,
    locale: "en_US",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: COMPANY.legalName,
    url: SITE_URL,
    logo: `${SITE_URL}/img/logo-icon.png`,
    description: COMPANY.tagline,
    address: {
      "@type": "PostalAddress",
      addressLocality: COMPANY.city,
      addressCountry: "ET",
      streetAddress: COMPANY.addressLine,
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: COMPANY.phone,
      email: COMPANY.email,
      contactType: "sales",
    },
    founder: {
      "@type": "Person",
      name: COMPANY.founder,
    },
  };

  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable} ${plexMono.variable} ${baloo.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-graphite focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
