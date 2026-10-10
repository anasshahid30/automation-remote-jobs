import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { homedir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = resolve(root, ".local");
mkdirSync(local, { recursive: true, mode: 0o700 });
const env = { ...process.env, SUPABASE_HOME: resolve(local, "supabase-cli"), SUPABASE_TELEMETRY_DISABLED: "true", SUPABASE_USE_SLIM_IMAGES: "true", SUPABASE_INTERNAL_IMAGE_REGISTRY: "ghcr.io" };
// Docker's client proxy injection breaks BusyBox's localhost health probes: it ignores
// NO_PROXY. Use a separate config for our local-only services when the platform's
// existing client config contains only proxies. The daemon keeps its registry proxy.
const existingConfig = resolve(process.env.DOCKER_CONFIG || resolve(homedir(), ".docker"), "config.json");
if (existsSync(existingConfig)) {
  const config = JSON.parse(readFileSync(existingConfig, "utf8"));
  if (Object.keys(config).length === 1 && config.proxies) {
    const directory = resolve(local, "docker-local-services");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const destination = resolve(directory, "config.json");
    if (!existsSync(destination)) writeFileSync(destination, "{}\n", { mode: 0o600, flag: "wx" });
    env.DOCKER_CONFIG = directory;
  }
}
const args = process.argv.slice(2);
// Do not send generated local keys to terminal/log collectors.
const result = spawnSync(process.execPath, [resolve(root, "node_modules/supabase/dist/supabase.js"), ...args], {
  cwd: root, env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
});
const log = resolve(local, "supabase-command.log");
writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`, { mode: 0o600 });
if (result.error || result.status !== 0 || /error:|fatal:|EROFS:/i.test(result.stderr ?? "")) {
  console.error("Supabase command failed. Inspect .local/supabase-command.log privately; it may contain local credentials.");
  process.exit(result.status || 1);
}
if (args[0] === "test") console.log(result.stdout);
else console.log(`Supabase ${args.join(" ")} completed. Details retained in the private local log.`);
