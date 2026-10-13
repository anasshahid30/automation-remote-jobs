export function GET() {
  return Response.json({ status: "ok", component: "dashboard", phase: 3 }, { headers: { "Cache-Control": "no-store" } });
}
