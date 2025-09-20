// File: app/api/export/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const headers = new Headers();
  if (authHeader) headers.append("Authorization", authHeader);

  const search = req.nextUrl.search;
  const url = `${process.env.BACKEND_URL}/export${search}`;

  try {
    const r = await fetch(url, { headers, cache: "no-store" });
    const ct = r.headers.get("content-type") || "application/octet-stream";
    const cd = r.headers.get("content-disposition") || undefined;
    const respHeaders: Record<string, string> = { "Content-Type": ct };
    if (cd) respHeaders["Content-Disposition"] = cd;
    return new NextResponse(r.body, { status: r.status, headers: respHeaders });
  } catch (err: any) {
    console.error("API proxy error for /export:", err);
    return new NextResponse(
      JSON.stringify({ error: "Failed to reach backend", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
