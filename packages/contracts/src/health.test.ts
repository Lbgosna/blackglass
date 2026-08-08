import { describe, expect, it } from "vitest";

import { HealthResponseSchema } from "./health.js";

describe("HealthResponseSchema", () => {
  it("accepts the exact health response", () => {
    expect(HealthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  it.each([
    { status: "ok", detail: "ready" },
    { status: "down" },
    { status: true },
    {},
    null,
  ])("rejects malformed or expanded payload %#", (payload) => {
    expect(HealthResponseSchema.safeParse(payload).success).toBe(false);
  });
});
