import { buildApp } from "./app.js";
import { apiPortFromEnvironment } from "./config.js";

const HOST = "127.0.0.1";

const app = buildApp();
let closePromise: Promise<void> | undefined;

function closeOnce(): Promise<void> {
  closePromise ??= app.close();
  return closePromise;
}

async function shutdown(): Promise<void> {
  try {
    await closeOnce();
  } catch (error) {
    console.error("Failed to stop the API cleanly.", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  const port = apiPortFromEnvironment(process.env);
  await app.listen({ host: HOST, port });
  console.log(`Blackglass API listening at http://${HOST}:${port}`);
} catch (error) {
  console.error("Blackglass API failed to start.", error);
  process.exitCode = 1;
  await closeOnce();
}
