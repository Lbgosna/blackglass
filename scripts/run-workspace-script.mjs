import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const allowedScripts = new Set(["build", "typecheck"]);
const workspaceRoots = ["apps", "packages", "plugins"];

async function workspacePackages(repositoryRoot) {
  const packages = [];

  for (const workspaceRoot of workspaceRoots) {
    const root = path.join(repositoryRoot, workspaceRoot);
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      try {
        const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
        packages.push({ directory, manifest });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }

  return packages;
}

async function main() {
  const script = process.argv[2];
  if (!allowedScripts.has(script)) throw new Error(`Unsupported workspace script: ${script ?? "<missing>"}`);

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packages = (await workspacePackages(repositoryRoot)).filter(
    ({ manifest }) => typeof manifest.scripts?.[script] === "string",
  );

  if (packages.length === 0) {
    console.log(`No workspace package defines ${script} yet.`);
    return;
  }

  for (const { directory, manifest } of packages) {
    console.log(`Running ${script} in ${manifest.name ?? path.relative(repositoryRoot, directory)}.`);
    const result = spawnSync("pnpm", ["run", script], {
      cwd: directory,
      encoding: "utf8",
      shell: false,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

await main();
