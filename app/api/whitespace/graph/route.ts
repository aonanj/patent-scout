// app/api/whitespace/graph/route.ts
import { NextRequest, NextResponse } from "next/server";

import { fetchWithRetry } from "../../_lib/fetch-with-retry";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const headers = new Headers();
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }
  headers.append("Content-Type", "application/json");

  const body = await req.json();
  const url = `${process.env.BACKEND_URL}/whitespace/graph`;

  try {
    const payload = JSON.stringify(body);
    const r = await fetchWithRetry(() =>
      fetch(url, {
        method: "POST",
        headers: headers,
        body: payload,
        cache: "no-store"
      })
    );
    const t = await r.text();

    return new NextResponse(t, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("API proxy error for /whitespace/graph:", err);
    return new NextResponse(
      JSON.stringify({ error: "Failed to reach backend", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
