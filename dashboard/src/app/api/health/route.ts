export function GET() {
  return Response.json({ status: "ok", component: "dashboard", phase: 4 }, { headers: { "Cache-Control": "no-store" } });
}
