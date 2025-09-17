// app/layout.tsx
"use client";
import "./globals.css";
import { Auth0Provider } from "@auth0/auth0-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patent Scout",
  description: "Hybrid patent search + alerts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!;
  const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE!;
  return (
    <html lang="en">
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{ 
          redirect_uri: typeof window !== "undefined" ? window.location.origin : undefined, audience: audience }}
      >
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
      </Auth0Provider>
    </html>
  );
}
