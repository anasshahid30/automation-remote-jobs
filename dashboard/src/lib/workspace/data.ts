import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
export type UserClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export async function toDatabaseTime(client: UserClient, local: string) {
  if (!local) return null;
  const { data, error } = await client.rpc("local_time_to_utc", {
    p_value: local,
  });
  if (error) throw new Error("Date and time could not be converted.");
  return data;
}

export function pageNumber(value?: string) {
  return Math.max(1, Math.min(10000, Number.parseInt(value ?? "1", 10) || 1));
}
export function searchTerm(value?: string) {
  return (value ?? "").trim().slice(0, 100).replace(/[%_]/g, "");
}
export function pageHref(
  path: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  query.set("page", String(page));
  return `${path}?${query}`;
}
