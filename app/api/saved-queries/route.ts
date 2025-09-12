const BASE = process.env.BACKEND_URL;

export async function GET(): Promise<Response> {
  const r = await fetch(`${process.env.BACKEND_URL}/saved-queries`, {
    cache: "no-store",
  });
  const t = await r.text();
  return new Response(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const r = await fetch(`${process.env.BACKEND_URL}/saved-queries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  return new Response(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

