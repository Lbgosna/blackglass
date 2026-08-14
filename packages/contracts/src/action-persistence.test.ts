import { describe, expect, it } from "vitest";

import { RecordPersistedLateWarningInputSchema } from "./action-persistence.js";

const validInput = {
  engagementId: "10000000-0000-4000-8000-000000000001",
  actionId: "action-late",
  expectedRevision: 2,
  snapshotVersion: 1,
  snapshotBinding: "sha256:fixture-snapshot-1",
  reasonCodes: ["outside_scope"],
  addition: {
    hostname: "cdn.target.test",
    address: "192.0.2.50",
  },
  pendingEventId: 1,
  occurredAt: "2026-08-12T12:00:00.000Z",
} as const;

describe("persisted late-warning input", () => {
  it("accepts persist input without a caller-supplied run state", () => {
    expect(RecordPersistedLateWarningInputSchema.safeParse(validInput).success).toBe(
      true,
    );
  });

  it("rejects a caller-supplied run state as unknown input", () => {
    expect(
      RecordPersistedLateWarningInputSchema.safeParse({
        ...validInput,
        runState: "running",
      }).success,
    ).toBe(false);
  });
});
