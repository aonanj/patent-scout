import "./globals.css";
import type { Metadata } from "next";
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
  title: "Patent Scout",
  description: "Search, volume trend, and alerting on AI-related patents and publications using embeddings similarity search. Featuring semantic search, weekly updates, and customized email alerts.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <body className={`${appSans.className} app-shell min-h-screen text-gray-900`}>
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
