import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEADLINE_MS = 20_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function allocatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitFor(description, operation, processState, timeout = DEADLINE_MS) {
  const deadline = Date.now() + timeout;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value !== undefined) return value;
    } catch (error) {
      lastError = error;
    }
    if (processState?.exited) break;
    await delay(25);
  }

  const logs = processState ? `\nstdout:\n${processState.stdout}\nstderr:\n${processState.stderr}` : "";
  throw new Error(
    `Timed out waiting for ${description}.${lastError ? ` Last error: ${lastError}` : ""}${logs}`,
  );
}

function startDev(environment = {}) {
  const child = spawn("pnpm", ["dev"], {
    cwd: repositoryRoot,
    detached: true,
    env: {
      ...process.env,
      BLACKGLASS_API_PORT: undefined,
      BLACKGLASS_WEB_PORT: undefined,
      ...environment,
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state = { exited: false, stderr: "", stdout: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    state.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    state.stderr += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      state.exited = true;
      resolve({ code, signal });
    });
  });
  return { child, exited, state };
}

function signalGroup(child, signal) {
  assert.ok(child.pid);
  process.kill(-child.pid, signal);
}

async function waitForExit(dev, description) {
  return waitFor(description, async () => {
    if (!dev.state.exited) return undefined;
    return dev.exited;
  }, dev.state);
}

async function waitForJson(url, state) {
  return waitFor(url, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return undefined;
    return response.json();
  }, state);
}

async function waitForClosed(port, state) {
  return waitFor(`port ${port} to close`, async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(200) });
      return undefined;
    } catch {
      return true;
    }
  }, state);
}

async function childProcessIds(pid) {
  try {
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    return children
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function descendantProcessIds(rootPid) {
  const descendants = [];
  const pending = await childProcessIds(rootPid);
  while (pending.length > 0) {
    const pid = pending.pop();
    if (pid === undefined) continue;
    descendants.push(pid);
    pending.push(...(await childProcessIds(pid)));
  }
  return descendants;
}

async function waitForProcessesGone(processIds) {
  await waitFor("development descendants to exit", async () => {
    const remaining = [];
    for (const pid of processIds) {
      try {
        process.kill(pid, 0);
        remaining.push(pid);
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    return remaining.length === 0 ? true : undefined;
  });
}

function nonLoopbackIpv4() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return undefined;
}

test("pnpm dev boots the default loopback web and API path and stops on SIGINT", async (t) => {
  const defaultPorts = [3001, 5173];
  for (const port of defaultPorts) {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen({ host: "127.0.0.1", port }, resolve);
    });
    await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  }

  const dev = startDev();
  t.after(() => {
    if (!dev.state.exited) signalGroup(dev.child, "SIGKILL");
  });

  assert.deepEqual(await waitForJson("http://127.0.0.1:3001/health", dev.state), {
    status: "ok",
  });
  assert.deepEqual(await waitForJson("http://127.0.0.1:5173/health", dev.state), {
    status: "ok",
  });

  const pageResponse = await fetch("http://127.0.0.1:5173/", { signal: AbortSignal.timeout(500) });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /<div id="root"><\/div>/);
  assert.match(page, /src="\/src\/main\.tsx"/);

  const lanAddress = nonLoopbackIpv4();
  if (lanAddress) {
    await assert.rejects(
      fetch(`http://${lanAddress}:3001/health`, { signal: AbortSignal.timeout(500) }),
    );
    await assert.rejects(
      fetch(`http://${lanAddress}:5173/health`, { signal: AbortSignal.timeout(500) }),
    );
  }

  const descendants = await descendantProcessIds(dev.child.pid);
  assert.ok(descendants.length >= 4, `Expected the dev process tree, found ${descendants.join(", ")}`);
  signalGroup(dev.child, "SIGINT");
  await waitForExit(dev, "development process to stop after SIGINT");
  await Promise.all(defaultPorts.map((port) => waitForClosed(port)));
  await waitForProcessesGone(descendants);
});

test("pnpm dev honors distinct port overrides and stops on SIGTERM", async (t) => {
  const apiPort = await allocatePort();
  let webPort = await allocatePort();
  while (webPort === apiPort) webPort = await allocatePort();
  const dev = startDev({
    BLACKGLASS_API_PORT: String(apiPort),
    BLACKGLASS_WEB_PORT: String(webPort),
  });
  t.after(() => {
    if (!dev.state.exited) signalGroup(dev.child, "SIGKILL");
  });

  assert.deepEqual(await waitForJson(`http://127.0.0.1:${apiPort}/health`, dev.state), {
    status: "ok",
  });
  assert.deepEqual(await waitForJson(`http://127.0.0.1:${webPort}/health`, dev.state), {
    status: "ok",
  });

  const descendants = await descendantProcessIds(dev.child.pid);
  signalGroup(dev.child, "SIGTERM");
  await waitForExit(dev, "development process to stop after SIGTERM");
  await Promise.all([waitForClosed(apiPort), waitForClosed(webPort)]);
  await waitForProcessesGone(descendants);
});

test("pnpm dev rejects invalid configuration before opening a listener", async () => {
  const webPort = await allocatePort();
  const dev = startDev({ BLACKGLASS_API_PORT: "", BLACKGLASS_WEB_PORT: String(webPort) });

  const result = await waitForExit(dev, "invalid configuration to fail");
  assert.notEqual(result.code, 0);
  assert.match(dev.state.stderr, /BLACKGLASS_API_PORT must be a decimal integer/);
  await waitForClosed(webPort);
});

test("pnpm dev rejects equal ports before opening a listener", async () => {
  const port = await allocatePort();
  const dev = startDev({
    BLACKGLASS_API_PORT: String(port),
    BLACKGLASS_WEB_PORT: String(port),
  });

  const result = await waitForExit(dev, "equal ports to fail");
  assert.notEqual(result.code, 0);
  assert.match(dev.state.stderr, /must use different ports/);
  await waitForClosed(port);
});

test("API bind failure stops the web sibling and propagates failure", async (t) => {
  const occupiedApi = net.createServer();
  await new Promise((resolve, reject) => {
    occupiedApi.once("error", reject);
    occupiedApi.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  t.after(
    () =>
      new Promise((resolve, reject) =>
        occupiedApi.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = occupiedApi.address();
  assert.ok(address && typeof address === "object");
  const webPort = await allocatePort();
  const dev = startDev({
    BLACKGLASS_API_PORT: String(address.port),
    BLACKGLASS_WEB_PORT: String(webPort),
  });
  t.after(() => {
    if (!dev.state.exited) signalGroup(dev.child, "SIGKILL");
  });

  const result = await waitForExit(dev, "API bind failure to stop development");
  assert.notEqual(result.code, 0);
  assert.match(`${dev.state.stdout}\n${dev.state.stderr}`, /EADDRINUSE/);
  await waitForClosed(webPort);
});
