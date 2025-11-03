import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "./providers";
import NavBar from "../components/NavBar";
import GlitchtipInit from "../components/GlitchtipInit";
import localFont from "next/font/local";

// Load the project-wide sans-serif font from public/fonts
const appSans = localFont({
  src: [
    { path: "../public/fonts/inter-v20-latin-regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-italic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/inter-v20-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-500italic.woff2", weight: "500", style: "italic" },
    { path: "../public/fonts/inter-v20-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-600italic.woff2", weight: "600", style: "italic" },
    { path: "../public/fonts/inter-v20-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-700italic.woff2", weight: "700", style: "italic" },
    { path: "../public/fonts/inter-v20-latin-800.woff2", weight: "800", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-800italic.woff2", weight: "800", style: "italic" },
    { path: "../public/fonts/inter-v20-latin-900.woff2", weight: "900", style: "normal" },
    { path: "../public/fonts/inter-v20-latin-900italic.woff2", weight: "900", style: "italic" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://patent-scout.vercel.app"),
  applicationName: "Patent Scout",
  title: {
    default: "Patent Scout | AI Patent Intelligence Platform",
    template: "%s | Patent Scout",
  },
  description:
    "Patent Scout delivers semantic patent search, whitespace graph analytics, and automated alerts so IP teams can monitor AI and machine learning filings in real time.",
  keywords: [
    "AI patent search",
    "machine learning patents",
    "intellectual property analytics",
    "pgvector patent database",
    "semantic patent search",
    "whitespace analysis",
    "patent alerts platform",
  ],
  authors: [{ name: "Patent Scout" }],
  creator: "Patent Scout",
  publisher: "Phaethon Order LLC",
  openGraph: {
    title: "Patent Scout | AI Patent Intelligence Platform",
    description:
      "Monitor AI and ML patent filings with semantic search, automated alerts, and whitespace graph analytics powered by Patent Scout.",
    url: "https://patent-scout.vercel.app/",
    siteName: "Patent Scout",
    images: [
      {
        url: "https://patent-scout.vercel.app/images/PatentScoutLogo.png",
        width: 1200,
        height: 630,
        alt: "Patent Scout logo with AI patent analytics interface",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Patent Scout | AI Patent Intelligence Platform",
    description:
      "Powerful AI and machine learning patent discovery with semantic search, trends, and automated alerts.",
    images: ["https://patent-scout.vercel.app/images/PatentScoutLogo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <body className={`${appSans.className} app-shell min-h-screen text-gray-900`}>
        <Script
          id="patent-scout-structured-data"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              [
                {
                  "@context": "https://schema.org",
                  "@type": "Organization",
                  name: "Patent Scout",
                  url: "https://patent-scout.vercel.app",
                  description:
                    "Patent Scout is an AI-driven patent intelligence platform with semantic search, whitespace graph analytics, and automated alerts.",
                  logo: "https://patent-scout.vercel.app/images/PatentScoutLogo.png"
                },
                {
                  "@context": "https://schema.org",
                  "@type": "WebSite",
                  name: "Patent Scout",
                  url: "https://patent-scout.vercel.app",
                  potentialAction: {
                    "@type": "SearchAction",
                    target: "https://patent-scout.vercel.app/?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                  },
                },
              ],
              null,
              0
            ),
          }}
        />
        {/* Client-side observability hooks */}
        <GlitchtipInit />
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
