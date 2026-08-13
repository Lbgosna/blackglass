import { describe, expect, it } from "vitest";

import {
  ActionPlanningAggregateSchema,
  ActionPlanningResultSchema,
  ActionSnapshotBindingSchema,
  ActionSnapshotSchema,
  ResolutionSnapshotSchema,
  WarningAcknowledgmentSchema,
} from "./action-planning.js";

const snapshot = {
  normalizationProfile: "d1-v1",
  orchestrationProfile: "d2-v1",
  snapshotId: "snapshot-1",
  version: 1,
  binding: "sha256:fixture-snapshot-1",
  actionId: "action-1",
  canonicalTargets: [
    {
      normalizationProfile: "d1-v1",
      kind: "hostname",
      hostname: "app.target.test",
    },
  ],
  concreteDestinations: [
    {
      normalizationProfile: "d1-v1",
      kind: "ip",
      family: 4,
      address: "192.0.2.40",
      zone: null,
    },
  ],
  typedOptions: { ports: [80, 443], followRedirects: true },
  resolutionSnapshots: [
    {
      canonicalQueryName: "app.target.test",
      resolverMode: "system",
      cnameChain: [],
      answers: [{ address: "192.0.2.40", family: 4, ttlSeconds: 60 }],
      resolvedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  scopeRevisionId: "scope-revision-7",
  warningState: {
    reasonCodes: ["outside_scope"],
    knownAdditions: [],
    acknowledgment: null,
  },
} as const;

const acknowledgment = {
  actionId: "action-1",
  snapshotId: "snapshot-1",
  snapshotVersion: 1,
  snapshotBinding: "sha256:fixture-snapshot-1",
  scopeRevisionId: "scope-revision-7",
  reasonCodes: ["outside_scope"],
  knownAdditions: [],
  source: "operator_continue",
  acknowledgedAt: "2026-08-09T12:10:00.000Z",
  pendingEventId: null,
  coveredDestinations: [],
} as const;

const queuedAction = {
  orchestrationProfile: "d2-v1",
  actionId: "action-1",
  state: "queued",
  snapshots: [snapshot],
  queuedSnapshotVersion: 1,
  warningAcknowledgment: acknowledgment,
  pendingWarning: null,
  coveredDestinations: [],
  warningInteractions: 1,
  runState: null,
  resumeRequested: false,
  cleanupRequired: false,
  capabilityErrorCode: null,
} as const;

describe("action planning contracts", () => {
  it("accepts versioned resolution, snapshot, warning, and aggregate shapes", () => {
    expect(ResolutionSnapshotSchema.safeParse(snapshot.resolutionSnapshots[0]).success).toBe(true);
    expect(ActionSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(WarningAcknowledgmentSchema.safeParse(acknowledgment).success).toBe(true);
    expect(ActionPlanningAggregateSchema.safeParse(queuedAction).success).toBe(true);
  });

  it.each([
    "sha256:fixture-snapshot-1",
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ])("accepts the accepted opaque snapshot binding shape %s", (binding) => {
    expect(ActionSnapshotBindingSchema.safeParse(binding).success).toBe(true);
  });

  it.each(["", "fixture", "sha256:", "sha256:secret value", "md5:x"])(
    "rejects malformed opaque snapshot binding %s",
    (binding) => {
      expect(ActionSnapshotBindingSchema.safeParse(binding).success).toBe(false);
    },
  );

  it("rejects unknown fields and non-JSON typed options", () => {
    expect(ActionSnapshotSchema.safeParse({ ...snapshot, unexpected: true }).success).toBe(false);
    expect(
      ActionSnapshotSchema.safeParse({
        ...snapshot,
        typedOptions: { callback: () => undefined },
      }).success,
    ).toBe(false);
    expect(
      ActionSnapshotSchema.safeParse({
        ...snapshot,
        typedOptions: { numeric: Number.NaN },
      }).success,
    ).toBe(false);
  });

  it("rejects acknowledgment and lifecycle references outside the aggregate", () => {
    expect(
      ActionPlanningAggregateSchema.safeParse({
        ...queuedAction,
        warningAcknowledgment: {
          ...acknowledgment,
          snapshotBinding: "sha256:different",
        },
      }).success,
    ).toBe(false);
    expect(
      ActionPlanningAggregateSchema.safeParse({
        ...queuedAction,
        state: "active_paused_for_warning",
        runState: "running",
      }).success,
    ).toBe(false);
    expect(
      ActionPlanningAggregateSchema.safeParse({
        ...queuedAction,
        state: "capability_error",
        capabilityErrorCode: "target_set_unrepresentable",
      }).success,
    ).toBe(false);
  });

  it("enforces strict result discriminants without reflecting error details", () => {
    expect(ActionPlanningResultSchema.safeParse({ ok: true, action: queuedAction }).success).toBe(true);
    expect(
      ActionPlanningResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_action_transition" },
      }).success,
    ).toBe(true);
    expect(
      ActionPlanningResultSchema.safeParse({
        ok: false,
        error: { code: "run_not_retryable" },
      }).success,
    ).toBe(true);
    expect(
      ActionPlanningResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_action_transition", detail: "untrusted" },
      }).success,
    ).toBe(false);
  });
});
