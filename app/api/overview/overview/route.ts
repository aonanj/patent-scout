// app/api/overview/overview/route.ts

import { NextRequest, NextResponse } from "next/server";

import { fetchWithRetry } from "../../_lib/fetch-with-retry";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const headers = new Headers();
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }

  const searchParams = req.nextUrl.search;
  const url = `${process.env.BACKEND_URL}/overview/overview${searchParams}`;

  try {
    const response = await fetchWithRetry(() =>
      fetch(url, {
        headers,
        cache: "no-store",
      })
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("API proxy error for /overview/overview:", err);
    return new NextResponse(
      JSON.stringify({ error: "Failed to reach backend", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

