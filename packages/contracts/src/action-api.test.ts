import { describe, expect, it } from "vitest";

import {
  ActionIdParamsSchema,
  ActionMutationErrorSchema,
  ActionMutationQuerySchema,
  ActionQueryErrorSchema,
  AddScopeAndRunActionRequestSchema,
  CancelActionRequestSchema,
  ContinueActionRequestSchema,
  CreateActionRequestSchema,
  RAW_ACTION_TARGET_MAX_UTF8_BYTES,
} from "./action-api.js";

const engagementId = "10000000-0000-4000-8000-000000000001";
const actionId = "10000000-0000-4000-8000-000000000002";

describe("action API contracts", () => {
  it("accepts only strict UUIDv4 engagement and action path parameters", () => {
    expect(
      ActionIdParamsSchema.parse({ engagementId, actionId }),
    ).toEqual({ engagementId, actionId });
    expect(
      ActionIdParamsSchema.safeParse({ engagementId, actionId: "action-1" })
        .success,
    ).toBe(false);
    expect(
      ActionIdParamsSchema.safeParse({
        engagementId,
        actionId,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("requires explicit engagement and nullable active-scope revisions", () => {
    expect(
      CreateActionRequestSchema.parse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.10"],
      }),
    ).toEqual({
      expectedEngagementRevision: 1,
      expectedActiveScopeRevisionId: null,
      targets: ["192.0.2.10"],
      declaredPorts: null,
    });
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        targets: ["192.0.2.10"],
      }).success,
    ).toBe(false);
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.10"],
        reasonCodes: ["outside_scope"],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate, oversized, and caller-supplied execution fields", () => {
    const oversized = "a".repeat(RAW_ACTION_TARGET_MAX_UTF8_BYTES + 1);
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.10", "192.0.2.10"],
      }).success,
    ).toBe(false);
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: [oversized],
      }).success,
    ).toBe(false);
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.10"],
        command: "nmap -sS 192.0.2.10",
      }).success,
    ).toBe(false);
    expect(
      CreateActionRequestSchema.safeParse({
        expectedEngagementRevision: 1,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.10"],
        flags: ["-sS"],
      }).success,
    ).toBe(false);
  });

  it("pins continue, add-scope, and cancel request shapes", () => {
    expect(
      ContinueActionRequestSchema.parse({
        expectedRevision: 1,
        snapshotVersion: 1,
        snapshotBinding: "sha256:fixture-snapshot-1",
      }),
    ).toEqual({
      expectedRevision: 1,
      snapshotVersion: 1,
      snapshotBinding: "sha256:fixture-snapshot-1",
    });
    expect(
      AddScopeAndRunActionRequestSchema.parse({
        expectedEngagementRevision: 2,
        expectedActionRevision: 1,
        rules: [],
      }),
    ).toEqual({
      expectedEngagementRevision: 2,
      expectedActionRevision: 1,
      rules: [],
    });
    expect(CancelActionRequestSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1,
    });
    expect(ActionMutationQuerySchema.parse({})).toEqual({});
    expect(
      ContinueActionRequestSchema.safeParse({
        expectedRevision: 1,
        snapshotVersion: 1,
        snapshotBinding: "sha256:fixture-snapshot-1",
        acknowledgment: true,
      }).success,
    ).toBe(false);
  });

  it("rejects reflective or unknown error fields", () => {
    expect(ActionQueryErrorSchema.parse({ code: "action_not_found" })).toEqual({
      code: "action_not_found",
    });
    expect(
      ActionMutationErrorSchema.parse({
        code: "revision_conflict",
        resourceType: "action",
        resourceId: actionId,
        currentRevision: 3,
      }),
    ).toEqual({
      code: "revision_conflict",
      resourceType: "action",
      resourceId: actionId,
      currentRevision: 3,
    });
    expect(
      ActionMutationErrorSchema.safeParse({
        code: "invalid_request",
        target: "192.0.2.10",
      }).success,
    ).toBe(false);
    expect(
      ActionQueryErrorSchema.safeParse({
        code: "invalid_persisted_data",
        path: "/private/data",
      }).success,
    ).toBe(false);
  });
});
