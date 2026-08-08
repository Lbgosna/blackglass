import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { readDevConfig } from "./dev-config.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORCE_STOP_AFTER_MS = 5_000;

function exitPromise(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function processGroupExists(child) {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessGroup(child, deadline) {
  while (processGroupExists(child) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !processGroupExists(child);
}

async function stopChild(child, exited, signal) {
  if (!processGroupExists(child)) {
    await exited;
    return;
  }
  signalProcessGroup(child, signal);
  if (!(await waitForProcessGroup(child, Date.now() + FORCE_STOP_AFTER_MS))) {
    signalProcessGroup(child, "SIGKILL");
    await waitForProcessGroup(child, Date.now() + FORCE_STOP_AFTER_MS);
  }
  await exited;
}

async function main() {
  let config;
  try {
    config = readDevConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const pnpmProgram = process.env.npm_execpath;
  if (!pnpmProgram) {
    console.error("pnpm executable path is unavailable. Start development with pnpm dev.");
    process.exitCode = 1;
    return;
  }

  const environment = {
    ...process.env,
    BLACKGLASS_API_PORT: String(config.apiPort),
    BLACKGLASS_WEB_PORT: String(config.webPort),
  };
  const definitions = [
    { label: "API", packageName: "@blackglass/api" },
    { label: "web", packageName: "@blackglass/web" },
  ];
  const children = definitions.map(({ label, packageName }) => {
    const child = spawn(process.execPath, [pnpmProgram, "--filter", packageName, "run", "dev"], {
      cwd: repositoryRoot,
      detached: true,
      env: environment,
      shell: false,
      stdio: "inherit",
    });
    return { child, exited: exitPromise(child), label };
  });

  let shutdownPromise;
  function shutdown(signal, exitCode) {
    shutdownPromise ??= Promise.all(
      children.map(({ child, exited }) => stopChild(child, exited, signal)),
    ).then(() => {
      process.exitCode = exitCode;
    });
    return shutdownPromise;
  }

  process.once("SIGINT", () => void shutdown("SIGINT", 130));
  process.once("SIGTERM", () => void shutdown("SIGTERM", 143));

  for (const { child, label } of children) {
    child.once("error", (error) => {
      console.error(`Failed to start the Blackglass ${label} process.`, error);
      void shutdown("SIGTERM", 1);
    });
  }

  for (const { exited, label } of children) {
    void exited.then(({ code, signal }) => {
      if (shutdownPromise) return;
      console.error(
        `Blackglass ${label} process exited unexpectedly (${signal ?? `code ${code ?? 1}`}).`,
      );
      void shutdown("SIGTERM", code && code > 0 ? code : 1);
    });
  }

  await Promise.all(children.map(({ exited }) => exited));
  if (shutdownPromise) await shutdownPromise;
}

await main();
