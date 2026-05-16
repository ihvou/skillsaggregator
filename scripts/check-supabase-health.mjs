#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const prefix = process.env.SUPABASE_CONTAINER_PREFIX ?? "supabase_";

async function docker(args) {
  const { stdout } = await execFileP("docker", args, { maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

async function main() {
  const names = (await docker(["ps", "-a", "--format", "{{.Names}}"]))
    .trim()
    .split("\n")
    .filter((name) => name.startsWith(prefix));

  if (!names.length) {
    console.error(`No containers found with prefix '${prefix}'`);
    process.exit(1);
  }

  const containers = JSON.parse(await docker(["inspect", ...names]));

  for (const container of containers) {
    console.log([
      container.Name.replace(/^\//, ""),
      `status=${container.State.Status}`,
      `exit=${container.State.ExitCode}`,
      `restart=${container.HostConfig.RestartPolicy.Name || "no"}`,
      `started=${container.State.StartedAt}`,
    ].join(" "));
  }

  const unhealthy = containers.filter((container) =>
    container.State.Status !== "running"
    || container.HostConfig.RestartPolicy.Name !== "unless-stopped"
  );
  process.exitCode = unhealthy.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
