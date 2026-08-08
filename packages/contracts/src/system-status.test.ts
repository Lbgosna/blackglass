import { describe, expect, it } from "vitest";

import { SystemStatusResponseSchema } from "./system-status.js";

describe("SystemStatusResponseSchema", () => {
  it.each(["ready", "not_ready"] as const)("accepts the strict %s response", (readiness) => {
    expect(
      SystemStatusResponseSchema.parse({
        version: 1,
        overall: readiness,
        developmentStorage: readiness,
      }),
    ).toEqual({
      version: 1,
      overall: readiness,
      developmentStorage: readiness,
    });
  });

  it.each([
    { version: 1, overall: "ready", developmentStorage: "ready", path: "/secret" },
    { version: 2, overall: "ready", developmentStorage: "ready" },
    { version: 1, overall: "unknown", developmentStorage: "ready" },
    { version: 1, overall: "ready", developmentStorage: "not_ready" },
    { version: 1, overall: "not_ready", developmentStorage: "ready" },
    { version: 1, overall: "ready", developmentStorage: true },
    {},
    null,
  ])("rejects malformed or expanded payload %#", (payload) => {
    expect(SystemStatusResponseSchema.safeParse(payload).success).toBe(false);
  });
});
