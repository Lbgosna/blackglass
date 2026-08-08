import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const allowedScripts = new Set(["build", "test", "typecheck"]);
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

function localDependencies(workspacePackage, packageNames) {
  const manifest = workspacePackage.manifest;
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  };

  return Object.keys(dependencies).filter((name) => packageNames.has(name));
}

function sortPackages(packages) {
  const packagesByName = new Map();
  for (const workspacePackage of packages) {
    const name = workspacePackage.manifest.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`Workspace package at ${workspacePackage.directory} has no name.`);
    }
    if (packagesByName.has(name)) throw new Error(`Duplicate workspace package name: ${name}`);
    packagesByName.set(name, workspacePackage);
  }

  const packageNames = new Set(packagesByName.keys());
  const pending = new Map(
    [...packagesByName].map(([name, workspacePackage]) => [
      name,
      new Set(localDependencies(workspacePackage, packageNames)),
    ]),
  );
  const sorted = [];

  while (pending.size > 0) {
    const ready = [...pending]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([name]) => name)
      .sort();

    if (ready.length === 0) {
      throw new Error(`Workspace dependency cycle: ${[...pending.keys()].sort().join(", ")}`);
    }

    for (const name of ready) {
      sorted.push(packagesByName.get(name));
      pending.delete(name);
      for (const dependencies of pending.values()) dependencies.delete(name);
    }
  }

  return sorted;
}

async function main() {
  const script = process.argv[2];
  if (!allowedScripts.has(script)) throw new Error(`Unsupported workspace script: ${script ?? "<missing>"}`);

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packages = await workspacePackages(repositoryRoot);

  if (packages.length === 0) {
    throw new Error("No workspace packages found.");
  }

  const missing = packages.filter(({ manifest }) => typeof manifest.scripts?.[script] !== "string");
  if (missing.length > 0) {
    throw new Error(
      `Workspace packages missing ${script}: ${missing
        .map(({ manifest, directory }) => manifest.name ?? path.relative(repositoryRoot, directory))
        .sort()
        .join(", ")}`,
    );
  }

  for (const { directory, manifest } of sortPackages(packages)) {
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
