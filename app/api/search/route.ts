// app/api/search/route.ts
import { NextRequest } from "next/server";

import { fetchWithRetry } from "../_lib/fetch-with-retry";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 1. Get the Authorization header from the incoming request
    const authHeader = req.headers.get('authorization');

    // 2. Prepare headers for the backend request
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    if (authHeader) {
      headers.append("Authorization", authHeader);
    }

    // 3. Send to FastAPI backend with the new headers
    const payload = JSON.stringify(body);
    const resp = await fetchWithRetry(() =>
      fetch(`${process.env.BACKEND_URL}/search`, {
        method: "POST",
        headers: headers, // Use the prepared headers
        body: payload,
        cache: "no-store",
      })
    );

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("API proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to reach backend", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
