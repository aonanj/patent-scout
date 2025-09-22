import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";
import NavBar from "../components/NavBar";

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
      <body className="min-h-screen bg-white text-gray-900">
        <Providers>
          <NavBar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
