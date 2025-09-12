const BASE = process.env.BACKEND_URL;

export async function DELETE(
  _req: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const id = context.params.id;
  const r = await fetch(
    `${process.env.BACKEND_URL}/saved-queries/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  const t = await r.text();
  return new Response(t, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

