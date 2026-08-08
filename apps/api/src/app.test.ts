import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const openApps: ReturnType<typeof buildApp>[] = [];

function createApp(readiness: "ready" | "not_ready" = "ready") {
  const app = buildApp({ getDevelopmentStorageReadiness: () => readiness });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe("buildApp", () => {
  it("returns the exact health response", async () => {
    const app = createApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.body).toBe('{"status":"ok"}');
  });

  it("does not serve the health payload for unsupported methods", async () => {
    const app = createApp();

    const response = await app.inject({ method: "POST", url: "/health" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).not.toEqual({ status: "ok" });
  });

  it("does not install process signal listeners", async () => {
    const before = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    };

    createApp();

    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
  });

  it.each([
    ["ready", 200],
    ["not_ready", 503],
  ] as const)("returns the strict %s system status with HTTP %d", async (readiness, code) => {
    const app = createApp(readiness);

    const response = await app.inject({ method: "GET", url: "/api/v1/system/status" });

    expect(response.statusCode).toBe(code);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      version: 1,
      overall: readiness,
      developmentStorage: readiness,
    });
    expect(response.body).not.toContain("path");
    expect(response.body).not.toContain("error");
  });

  it("turns a status dependency failure into a path-free not-ready response", async () => {
    const app = buildApp({
      getDevelopmentStorageReadiness() {
        throw new Error("Storage failed at /private/development-data");
      },
    });
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/system/status" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      version: 1,
      overall: "not_ready",
      developmentStorage: "not_ready",
    });
    expect(response.body).not.toContain("private");
    expect(response.body).not.toContain("failed");
  });
});
