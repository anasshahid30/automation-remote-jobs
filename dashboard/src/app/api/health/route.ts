export function GET() {
  return Response.json({ status: "ok", component: "dashboard", phase: 1 }, { headers: { "Cache-Control": "no-store" } });
}
