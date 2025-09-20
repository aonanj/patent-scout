// app/api/saved-queries/route.ts
import { NextRequest } from "next/server";

const BASE = process.env.BACKEND_URL;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  const headers = new Headers();
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }

  const r = await fetch(`${BASE}/saved-queries`, { 
    headers: headers,
    cache: "no-store" 
  });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) {
    body.name = `Saved Query ${new Date().toISOString()}`;
  }
  const authHeader = req.headers.get('authorization');
  
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }

  const r = await fetch(`${BASE}/saved-queries`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
  });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { "Content-Type": "application/json" } });
}