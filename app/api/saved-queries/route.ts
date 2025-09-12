// app/api/saved-queries/route.ts
import { NextRequest } from "next/server";

const BASE = process.env.BACKEND_URL;

export async function GET() {
  const r = await fetch(`${BASE}/saved-queries`, { cache: "no-store" });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const r = await fetch(`${BASE}/saved-queries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { "Content-Type": "application/json" } });
}
