// app/api/whitespace/run/route.ts
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const authHeader = req.headers.get('authorization');

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    if (authHeader) {
      headers.append("Authorization", authHeader);
    }

    const resp = await fetch(`${process.env.BACKEND_URL}/whitespace/graph`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

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
