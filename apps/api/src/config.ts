import path from "node:path";

const DEFAULT_API_PORT = 3001;

export function apiPortFromEnvironment(environment: NodeJS.ProcessEnv): number {
  const rawPort = environment.BLACKGLASS_API_PORT;
  if (rawPort === undefined) return DEFAULT_API_PORT;
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error("BLACKGLASS_API_PORT must be a decimal integer from 1 through 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("BLACKGLASS_API_PORT must be a decimal integer from 1 through 65535.");
  }
  return port;
}

export function dataDirectoryFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const rawDataDirectory = environment.BLACKGLASS_DATA_DIR;
  if (
    rawDataDirectory === undefined ||
    rawDataDirectory.length === 0 ||
    rawDataDirectory.includes("\0") ||
    !path.isAbsolute(rawDataDirectory)
  ) {
    throw new Error("BLACKGLASS_DATA_DIR must be an explicit absolute path without NUL bytes.");
  }
  return path.resolve(rawDataDirectory);
}
