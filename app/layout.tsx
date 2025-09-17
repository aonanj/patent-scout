import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Patent Scout",
  description: "Search, volume trend, and alerting on AI-related patents and publications using embeddings similarity search. Featuring semantic search, weekly updates, and customized email alerts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
