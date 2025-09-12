// app/api/saved-queries/[id]/route.ts
import { NextResponse } from "next/server";

type RouteParams = { params: { id: string } };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const id = params.id;
  const r = await fetch(
    `${process.env.BACKEND_URL}/saved-queries/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  const t = await r.text();
  return new NextResponse(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}