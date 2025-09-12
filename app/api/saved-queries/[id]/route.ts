import { NextResponse } from "next/server";

export async function DELETE(_req: Request, context: any) {
  const { id } = (context?.params ?? {}) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

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
