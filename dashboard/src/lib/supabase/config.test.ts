import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "./config";

const anon = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
describe("server configuration", () => {
  it("reports missing configuration without inventing credentials", () => expect(readSupabaseConfig({})).toBeNull());
  it("accepts local anon configuration", () => expect(readSupabaseConfig({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_PUBLISHABLE_KEY: anon })?.url).toBe("http://127.0.0.1:54321"));
  it("accepts hosted publishable configuration", () => expect(readSupabaseConfig({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" })).not.toBeNull());
  it.each(["sb_secret_forbidden", `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`])("rejects a privileged key", (key) => expect(() => readSupabaseConfig({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: key })).toThrow());
  it.each(["http://project.supabase.co", "https://user:password@project.supabase.co", "https://project.supabase.co/?key=secret", "https://project.supabase.co/path"]) ("rejects insecure or credential-bearing URLs", (url) => expect(() => readSupabaseConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: anon })).toThrow());
});
