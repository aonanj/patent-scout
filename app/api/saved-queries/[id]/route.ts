import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, context: any) {
  const { id } = (context?.params ?? {}) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const authHeader = req.headers.get('authorization');
  const headers = new Headers();
  if (authHeader) {
    headers.append("Authorization", authHeader);
  }

  const r = await fetch(
    `${process.env.BACKEND_URL}/saved-queries/${encodeURIComponent(id)}`,
    { 
      method: "DELETE",
      headers: headers,
    }
  );
  const t = await r.text();

  return new NextResponse(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}