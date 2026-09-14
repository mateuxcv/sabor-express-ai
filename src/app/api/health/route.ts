export const runtime = "nodejs";

export function GET() {
  return Response.json({ status: "ok", service: "sabor-web" }, { headers: { "Cache-Control": "no-store" } });
}
