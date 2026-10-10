export function GET() {
  return Response.json({ status: "ok", component: "dashboard", phase: 2 }, { headers: { "Cache-Control": "no-store" } });
}
