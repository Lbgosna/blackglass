const DEFAULT_API_PORT = 3001;
const DEFAULT_WEB_PORT = 5173;

function readPort(environment, name, defaultPort) {
  const rawPort = environment[name];
  if (rawPort === undefined) return defaultPort;
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error(`${name} must be a decimal integer from 1 through 65535.`);
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a decimal integer from 1 through 65535.`);
  }
  return port;
}

export function readDevConfig(environment) {
  const apiPort = readPort(environment, "BLACKGLASS_API_PORT", DEFAULT_API_PORT);
  const webPort = readPort(environment, "BLACKGLASS_WEB_PORT", DEFAULT_WEB_PORT);
  if (apiPort === webPort) {
    throw new Error("BLACKGLASS_API_PORT and BLACKGLASS_WEB_PORT must use different ports.");
  }
  return { apiPort, webPort };
}
