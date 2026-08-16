import { describe, expect, it } from "vitest";

import {
  AcceptHeartbeatInputSchema,
  AcceptHeartbeatResultSchema,
  EvaluateRunEventSequenceInputSchema,
  EvaluateRunEventSequenceResultSchema,
  FencingTokenSchema,
  IncrementFenceResultSchema,
  LeaseAuthorityResultSchema,
  PositiveFencingTokenSchema,
  RunnerEventDigestSchema,
  RunnerLeaseSchema,
  RunnerSequenceCursorSchema,
  RunnerSequenceSchema,
  SelectSseResumeInputSchema,
  StoredRunEventSchema,
} from "./runner-control.js";

const digest = `sha256:${"a".repeat(64)}`;

const lease = {
  orchestrationProfile: "d2-v1",
  protocol: "runner-control-v1",
  runId: "run-fixture-1",
  leaseId: "lease-fixture-1",
  runnerId: "runner-fixture-1",
  sessionId: "session-fixture-1",
  fence: "7",
  expiresAt: "2026-08-09T12:00:30.000Z",
  latestHeartbeatSequence: 0,
  latestEventSequence: 0,
} as const;

describe("runner control contracts", () => {
  it("accepts the exact versioned lease wire shape", () => {
    expect(RunnerLeaseSchema.safeParse(lease).success).toBe(true);
    expect(
      RunnerLeaseSchema.safeParse({ ...lease, untrusted: true }).success,
    ).toBe(false);
    expect(
      RunnerLeaseSchema.safeParse({ ...lease, protocol: "runner-control-v2" })
        .success,
    ).toBe(false);
  });

  it.each([
    ["0", true, false],
    ["1", true, true],
    ["9223372036854775807", true, true],
    ["9223372036854775808", false, false],
    ["01", false, false],
    ["-1", false, false],
    [1, false, false],
  ])(
    "keeps signed 64-bit fence %j precise as a canonical string",
    (value, validFence, validPositiveFence) => {
      expect(FencingTokenSchema.safeParse(value).success).toBe(validFence);
      expect(PositiveFencingTokenSchema.safeParse(value).success).toBe(
        validPositiveFence,
      );
    },
  );

  it("rejects an oversized fence before BigInt conversion", () => {
    expect(FencingTokenSchema.safeParse("1".repeat(10_000)).success).toBe(false);
  });

  it("rejects malformed digests, timestamps, and sequence counters", () => {
    expect(RunnerEventDigestSchema.safeParse(digest).success).toBe(true);
    expect(
      RunnerEventDigestSchema.safeParse(`sha256:${"A".repeat(64)}`).success,
    ).toBe(false);
    expect(RunnerSequenceSchema.safeParse(0).success).toBe(false);
    expect(RunnerSequenceSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(
      false,
    );
    expect(RunnerSequenceCursorSchema.safeParse(0).success).toBe(true);
    expect(
      RunnerLeaseSchema.safeParse({ ...lease, expiresAt: "not-a-time" }).success,
    ).toBe(false);
  });

  it("binds a stored heartbeat to the presented sequence", () => {
    const input = {
      lease,
      presented: {
        runId: lease.runId,
        leaseId: lease.leaseId,
        runnerId: lease.runnerId,
        sessionId: lease.sessionId,
        fence: lease.fence,
      },
      heartbeatSequence: 2,
      requestDigest: digest,
      serverNow: "2026-08-09T12:00:10.000Z",
      storedHeartbeat: {
        heartbeatSequence: 1,
        requestDigest: digest,
        leaseExpiresAt: "2026-08-09T12:00:35.000Z",
      },
    };

    expect(AcceptHeartbeatInputSchema.safeParse(input).success).toBe(false);
    expect(
      AcceptHeartbeatInputSchema.safeParse({
        ...input,
        storedHeartbeat: { ...input.storedHeartbeat, heartbeatSequence: 2 },
      }).success,
    ).toBe(true);
  });

  it("requires stored event and terminal metadata to agree", () => {
    expect(
      StoredRunEventSchema.safeParse({
        kind: "event",
        digest,
        eventId: 42,
        terminalKind: null,
      }).success,
    ).toBe(true);
    expect(
      StoredRunEventSchema.safeParse({
        kind: "completion",
        digest,
        eventId: 43,
        terminalKind: "succeeded",
      }).success,
    ).toBe(true);
    expect(
      StoredRunEventSchema.safeParse({
        kind: "event",
        digest,
        eventId: 42,
        terminalKind: "failed",
      }).success,
    ).toBe(false);
    expect(
      StoredRunEventSchema.safeParse({
        kind: "completion",
        digest,
        eventId: 43,
        terminalKind: null,
      }).success,
    ).toBe(false);
  });

  it("enforces ordered retained SSE IDs and a truthful watermark", () => {
    const input = {
      retainedEventIds: [40, 41, 42, 43],
      lastEventId: 41,
      currentWatermark: 43,
      snapshotUrl: "/api/v1/engagements/engagement-fixture-2/snapshot",
    };
    expect(SelectSseResumeInputSchema.safeParse(input).success).toBe(true);
    expect(
      SelectSseResumeInputSchema.safeParse({
        ...input,
        retainedEventIds: [40, 42, 41],
      }).success,
    ).toBe(false);
    expect(
      SelectSseResumeInputSchema.safeParse({
        ...input,
        retainedEventIds: [40, 41, 41],
      }).success,
    ).toBe(false);
    expect(
      SelectSseResumeInputSchema.safeParse({
        ...input,
        currentWatermark: 42,
      }).success,
    ).toBe(false);
    expect(
      SelectSseResumeInputSchema.safeParse({
        ...input,
        retainedEventIds: [],
      }).success,
    ).toBe(false);
    expect(
      SelectSseResumeInputSchema.safeParse({
        ...input,
        retainedEventIds: [],
        currentWatermark: 0,
        lastEventId: 0,
      }).success,
    ).toBe(true);
  });

  it("keeps event inputs and public results strictly discriminated", () => {
    const eventInput = {
      kind: "event",
      lastAcceptedSequence: 0,
      presentedSequence: 1,
      presentedDigest: digest,
      storedAtSequence: null,
      currentTerminalKind: null,
    } as const;
    expect(EvaluateRunEventSequenceInputSchema.safeParse(eventInput).success).toBe(
      true,
    );
    expect(
      EvaluateRunEventSequenceInputSchema.safeParse({
        ...eventInput,
        terminalKind: "failed",
      }).success,
    ).toBe(false);
    expect(
      LeaseAuthorityResultSchema.safeParse({
        ok: false,
        error: { code: "stale_fence", detail: "secret" },
      }).success,
    ).toBe(false);
    expect(
      IncrementFenceResultSchema.safeParse({
        ok: false,
        error: { code: "fencing_exhausted" },
      }).success,
    ).toBe(true);
    expect(
      AcceptHeartbeatResultSchema.safeParse({
        ok: false,
        error: { code: "heartbeat_sequence_stale" },
      }).success,
    ).toBe(true);
    expect(
      EvaluateRunEventSequenceResultSchema.safeParse({
        ok: true,
        disposition: "accepted_event",
        eventId: null,
        acceptedSequence: 1,
        nextEventSequence: 2,
      }).success,
    ).toBe(true);
    expect(
      EvaluateRunEventSequenceResultSchema.safeParse({
        ok: true,
        disposition: "stored_event_replayed",
        eventId: 42,
        acceptedSequence: Number.MAX_SAFE_INTEGER,
        nextEventSequence: null,
      }).success,
    ).toBe(true);
    expect(
      EvaluateRunEventSequenceResultSchema.safeParse({
        ok: true,
        disposition: "stored_event_replayed",
        eventId: null,
        acceptedSequence: 1,
        nextEventSequence: 2,
      }).success,
    ).toBe(false);
  });
});
