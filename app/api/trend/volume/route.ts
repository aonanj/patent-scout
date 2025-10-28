// File: app/api/trend/volume/route.ts

import { NextRequest, NextResponse } from "next/server";

import { fetchWithRetry } from "../../_lib/fetch-with-retry";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const headers = new Headers();
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }

  // Forward the search parameters from the original request
  const searchParams = req.nextUrl.search;
  const url = `${process.env.BACKEND_URL}/trend/volume${searchParams}`;

  try {
    const r = await fetchWithRetry(() =>
      fetch(url, { 
        headers: headers,
        cache: "no-store" 
      })
    );
    const t = await r.text();

    return new NextResponse(t, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("API proxy error for /trend/volume:", err);
    return new NextResponse(
      JSON.stringify({ error: "Failed to reach backend", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
