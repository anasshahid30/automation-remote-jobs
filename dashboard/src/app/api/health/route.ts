export function GET() {
  return Response.json(
    { status: "ok", component: "dashboard", phase: 6 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
