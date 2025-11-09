import type { Metadata } from "next";
import HomePageClient from "../components/HomePageClient";

export const metadata: Metadata = {
  title: "AI Patent Search & Analytics Platform",
  description:
    "Patent Scout combines semantic patent search, IP overview graphing, and automated alerts so IP teams can rapidly track AI and machine learning filings.",
  alternates: {
    canonical: "/",
  },
};

export default function Page() {
  return <HomePageClient />;
}
