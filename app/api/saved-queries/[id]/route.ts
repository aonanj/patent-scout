import { NextRequest } from "next/server";

const BASE = process.env.BACKEND_URL;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const r = await fetch(`${BASE}/saved-queries/${encodeURIComponent(params.id)}`, { method: "DELETE" });
  const t = await r.text();
  return new Response(t, { status: r.status, headers: { "Content-Type": "application/json" } });
}
