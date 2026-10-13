export function GET() {
  return Response.json(
    { status: "ok", component: "dashboard", phase: 5 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
