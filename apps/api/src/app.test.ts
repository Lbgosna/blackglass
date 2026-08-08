import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const openApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe("buildApp", () => {
  it("returns the exact health response", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.body).toBe('{"status":"ok"}');
  });

  it("does not serve the health payload for unsupported methods", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "POST", url: "/health" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).not.toEqual({ status: "ok" });
  });

  it("does not install process signal listeners", async () => {
    const before = {
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    };

    const app = buildApp();
    openApps.push(app);

    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
  });
});
