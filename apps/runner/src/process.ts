import { mkdir, stat as fsStat } from "node:fs/promises";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { BoundedCollector, DEFAULT_COMBINED_RETAINED_OUTPUT } from "./bounded-output.js";
import { buildFakeActionArgv, controlledEnv, type FakeActionRequest } from "./fake-action.js";
import { createRedactor } from "./redaction.js";

export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  stdoutMeta: import("./bounded-output.js").TruncationMeta;
  stderrMeta: import("./bounded-output.js").TruncationMeta;
  truncated: boolean;
  cleanupFailed?: boolean;
}

export interface RunDirectories {
  runDir: string;
  tmpDir: string;
}

export function isPathTraversalAttempt(value: string): boolean {
  return value.includes("..") || value.includes("\0") || path.isAbsolute(value) || value.includes(path.sep);
}

export async function createRunDirectory(runRoot: string, runId: string, fence: string): Promise<RunDirectories> {
  if (runId.includes("..") || runId.includes("/") || runId.includes("\\") || runId.includes("\0")) {
    throw new Error("working_directory_escape");
  }
  if (fence.includes("..") || fence.includes("/") || fence.includes("\\") || fence.includes("\0")) {
    throw new Error("working_directory_escape");
  }
  const rootStat = await fsStat(runRoot).catch(() => null);
  if (rootStat !== null && !rootStat.isDirectory()) throw new Error("runRoot not a directory");
  await mkdir(runRoot, { recursive: true, mode: 0o700 });

  const safeRunId = runId.replace(/[^a-zA-Z0-9:_\-]/g, "_");
  const dirname = `run-${safeRunId}-f${fence}`;
  if (dirname.includes("..") || dirname.includes("/") || dirname.includes("\\")) {
    throw new Error("working_directory_escape");
  }
  const runDir = path.join(runRoot, dirname);
  const resolved = path.resolve(runDir);
  const rootResolved = path.resolve(runRoot);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error("working_directory_escape");
  }
  await mkdir(runDir, { recursive: false, mode: 0o700 });
  const tmpDir = path.join(runDir, "tmp");
  await mkdir(tmpDir, { recursive: true, mode: 0o700 });
  return { runDir, tmpDir };
}

/**
 * Supervise a child process group with TERM 5s, KILL 2s escalation.
 * Returns truthful partial output even on cancellation/failure.
 * The returned promise carries a `cancel()` method for deterministic test control.
 * Not `async` so the promise identity is preserved.
 */
export function runSupervised(
  request: FakeActionRequest & { runRoot: string; secrets?: string[]; executable?: string },
): Promise<ProcessResult> & { cancel: () => Promise<void>; child?: ChildProcess } {
  const executable = request.executable ?? process.execPath;

  let child: ChildProcess | undefined;
  let cancelRequested = false;
  let terminatedByRunner = false;

  let doCancel: () => Promise<void> = async () => {
    cancelRequested = true;
  };

  const promise = new Promise<ProcessResult>((resolve, reject) => {
    (async () => {
      try {
        const spec = buildFakeActionArgv(executable, request);
        const { runDir } = await createRunDirectory(request.runRoot, request.runId, request.fence);
        const env = controlledEnv(runDir, undefined);

        for (const k of Object.keys(env)) {
          if (["LD_PRELOAD", "LD_LIBRARY_PATH"].includes(k)) throw new Error(`environment_variable_denied: ${k}`);
        }

        const stdoutRedactor = createRedactor({ secrets: request.secrets ?? [] });
        const stderrRedactor = createRedactor({ secrets: request.secrets ?? [] });
        const stdoutCollector = new BoundedCollector(DEFAULT_COMBINED_RETAINED_OUTPUT);
        const stderrCollector = new BoundedCollector(DEFAULT_COMBINED_RETAINED_OUTPUT);

        try {
          child = nodeSpawn(spec.executable, spec.argv.slice(1), {
            cwd: runDir,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
            shell: false,
          });
        } catch (e) {
          reject(e);
          return;
        }

        const waitForClose = (cp: ChildProcess, timeoutMs: number): Promise<boolean> => {
          return new Promise((res) => {
            if (cp.exitCode !== null || cp.signalCode !== null) {
              res(true);
              return;
            }
            const onClose = (): void => {
              clearTimeout(timer);
              res(true);
            };
            const timer = setTimeout(() => {
              cp.off("close", onClose);
              res(false);
            }, timeoutMs);
            cp.once("close", onClose);
          });
        };

        doCancel = async () => {
          cancelRequested = true;
          if (child === undefined || child.pid === undefined) return;
          terminatedByRunner = true;
          const pgid = child.pid;
          try {
            process.kill(-pgid, "SIGTERM");
          } catch {
            try {
              child.kill("SIGTERM");
            } catch {}
          }
          const termDone = await waitForClose(child, 5000);
          if (termDone) return;
          try {
            process.kill(-pgid, "SIGKILL");
          } catch {
            try {
              child?.kill("SIGKILL");
            } catch {}
          }
          const killDone = await waitForClose(child!, 2000);
          if (!killDone) {
            // Descendant cleanup failed — truthful failure per ADR
            // Leave directory quarantined (caller can check cleanupFailed)
          }
          void terminatedByRunner;
        };

        (promise as unknown as { cancel: () => Promise<void> }).cancel = () => doCancel();
        (promise as unknown as { child?: ChildProcess }).child = child;

        const stdout = child.stdout;
        const stderr = child.stderr;
        if (stdout === null || stderr === null) {
          reject(new Error("missing stdio"));
          return;
        }

        stdout.on("data", (chunk: Buffer) => {
          const redacted = stdoutRedactor.push(chunk);
          stdoutCollector.push(chunk.length, redacted);
        });
        stderr.on("data", (chunk: Buffer) => {
          const redacted = stderrRedactor.push(chunk);
          stderrCollector.push(chunk.length, redacted);
        });

        child.on("error", (err) => reject(err));

        let closeEmitted = false;
        const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
          if (closeEmitted) return;
          closeEmitted = true;
          const stdoutTail = stdoutRedactor.flush();
          const stderrTail = stderrRedactor.flush();
          if (stdoutTail.length > 0) stdoutCollector.push(0, stdoutTail);
          if (stderrTail.length > 0) stderrCollector.push(0, stderrTail);
          const stdoutMeta = stdoutCollector.meta();
          const stderrMeta = stderrCollector.meta();
          const stillAlive = child !== undefined && child.exitCode === null && child.signalCode === null;
          resolve({
            exitCode: code,
            signal: signal as NodeJS.Signals | null,
            stdout: stdoutCollector.combined(),
            stderr: stderrCollector.combined(),
            stdoutMeta,
            stderrMeta,
            truncated: stdoutMeta.truncated || stderrMeta.truncated,
            cleanupFailed: stillAlive,
          });
        };
        child.on("close", onClose);

        // Latch cancellation requested before spawn
        if (cancelRequested) {
          void doCancel();
        }
      } catch (e) {
        reject(e);
      }
    })();
  }) as Promise<ProcessResult> & { cancel: () => Promise<void>; child?: ChildProcess };

  promise.cancel = () => doCancel();
  return promise;
}

export async function verifyExecutable(executable: string): Promise<void> {
  if (!executable.startsWith("/")) throw new Error("executable_path_not_absolute");
  const st = await fsStat(executable);
  if (!st.isFile()) throw new Error("executable_not_regular_file");
}
