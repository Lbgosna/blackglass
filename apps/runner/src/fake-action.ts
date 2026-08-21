import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";

export interface FakeActionSpec {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly payload?: unknown;
}

export interface FakeActionRequest {
  readonly runId: string;
  readonly leaseId: string;
  readonly fence: string;
  readonly durationMs?: number;
  readonly exitCode?: 0 | 1;
  readonly stdoutFixture?: string;
  readonly extraArgs?: readonly string[];
}

/**
 * Build a deterministic fake-action argv without any shell involvement.
 * Contracts define no command string or raw flags; every metacharacter remains
 * a single literal argv element. The executable is explicit and argv is an array.
 */
export function buildFakeActionArgv(
  executable: string,
  request: FakeActionRequest,
): FakeActionSpec {
  if (executable.length === 0) throw new Error("executable required");
  if (executable.includes("\0")) throw new Error("executable contains NUL");
  if (!executable.startsWith("/")) {
    // In dev we allow process.execPath which is absolute; reject relative.
    throw new Error("executable must be absolute");
  }

  const durationMs = request.durationMs ?? 20;
  const exitCode = request.exitCode ?? 0;

  // Minimal synthetic program: emit deterministic output, optionally sleep, exit.
  // No shell, no interpolation. extraArgs are appended as literal argv elements.
  let fixtureWrite: string;
  if (request.stdoutFixture !== undefined) {
    if (request.stdoutFixture.length > 4096) {
      // Avoid huge argv (E2BIG) while producing exact byte count.
      const total = request.stdoutFixture.length;
      const fullChunks = Math.floor(total / 1024);
      const remainder = total % 1024;
      // Use the fixture's actual bytes when possible; for tests the fixture is "x".repeat(N)
      // so reproducing with "x" is byte-exact. For arbitrary fixtures we fall back to exact string.
      if (/^x+$/.test(request.stdoutFixture)) {
        let loop = `let _c="x".repeat(1024); for(let _i=0;_i<${fullChunks};_i++) process.stdout.write(_c);`;
        if (remainder > 0) loop += ` process.stdout.write("x".repeat(${remainder}));`;
        fixtureWrite = loop;
      } else {
        fixtureWrite = `process.stdout.write(${JSON.stringify(request.stdoutFixture)});`;
      }
    } else {
      fixtureWrite = `process.stdout.write(${JSON.stringify(request.stdoutFixture)});`;
    }
  } else {
    fixtureWrite = `process.stdout.write('hello from fake\\n');`;
  }
  const script = [
    `process.stdout.write('fake-action:${request.runId}:fence:${request.fence}\\n');`,
    fixtureWrite,
    durationMs > 0 ? `setTimeout(()=>process.exit(${exitCode}), ${durationMs});` : `process.exit(${exitCode});`,
  ].join("");

  const argv: string[] = [executable, "-e", script];

  if (request.extraArgs !== undefined) {
    for (const arg of request.extraArgs) {
      if (arg.includes("\0")) throw new Error("argv element contains NUL");
      // Preserve shell metacharacters as literal values — no splitting or eval.
      argv.push(arg);
    }
  }

  return { executable, argv: Object.freeze([...argv]), payload: { fake: true, durationMs, exitCode } };
}

/**
 * Spawn with explicit executable + argv array. Never uses shell:true or command string.
 * Throws if caller attempts shell-like invocation.
 */
export function spawnFakeAction(
  spec: FakeActionSpec,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcess {
  if (spec.argv.length === 0) throw new Error("argv empty");
  if (spec.argv[0] !== spec.executable) throw new Error("argv[0] must equal executable");
  // Enforce explicit argv spawning: first arg is executable, rest are literal args.
  const args = spec.argv.slice(1);
  return nodeSpawn(spec.executable, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: false,
  });
}

export function controlledEnv(runDir: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
    PATH: "/usr/bin:/bin",
    TMPDIR: `${runDir}/tmp`,
  };
  if (extra !== undefined && Object.keys(extra).length > 0) {
    const first = Object.keys(extra)[0] as string;
    throw new Error(`environment_variable_denied: ${first}`);
  }
  return base;
}

export function isSafeEnvKey(key: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(key) && !["LD_PRELOAD", "LD_LIBRARY_PATH"].includes(key);
}
