import { z } from "zod";

import { ActionStateSchema } from "./action-planning.js";

export const RUNNER_CONTROL_PROFILE = "d2-v1" as const;
export const RUNNER_CONTROL_PROTOCOL = "runner-control-v1" as const;
export const RUNNER_LEASE_DURATION_SECONDS = 30;
export const RUNNER_SELF_FENCE_CLEANUP_SECONDS = 7;
export const MAX_FENCING_TOKEN = 9_223_372_036_854_775_807n;

const IdentifierSchema = z.string().min(1).max(255);
const TimestampSchema = z.iso.datetime({ offset: true });
const SafeIntegerSchema = z.number().int().safe();

export const RunnerEventDigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/);

function fencingTokenIsInRange(value: string): boolean {
  if (value.length > 19) {
    return false;
  }
  try {
    return BigInt(value) <= MAX_FENCING_TOKEN;
  } catch {
    return false;
  }
}

// Fences use canonical decimal strings on the wire so signed 64-bit values
// never lose precision in JSON or JavaScript.
export const FencingTokenSchema = z
  .string()
  .max(19)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine(fencingTokenIsInRange, { message: "fencing token out of range" });

export const PositiveFencingTokenSchema = FencingTokenSchema.refine(
  (value) => value !== "0",
  { message: "fencing token must be positive" },
);

export const RunnerSequenceSchema = SafeIntegerSchema.positive();
export const RunnerSequenceCursorSchema = SafeIntegerSchema.nonnegative();

export const RunStateSchema = z.enum([
  "queued",
  "leased",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
]);

export const RunTerminalKindSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled",
]);

export const RunnerLeaseSchema = z.strictObject({
  orchestrationProfile: z.literal(RUNNER_CONTROL_PROFILE),
  protocol: z.literal(RUNNER_CONTROL_PROTOCOL),
  runId: IdentifierSchema,
  leaseId: IdentifierSchema,
  runnerId: IdentifierSchema,
  sessionId: IdentifierSchema,
  fence: PositiveFencingTokenSchema,
  expiresAt: TimestampSchema,
  latestHeartbeatSequence: RunnerSequenceCursorSchema,
  latestEventSequence: RunnerSequenceCursorSchema,
});

export const LeaseAuthorityPresentationSchema = z.strictObject({
  runId: IdentifierSchema,
  leaseId: IdentifierSchema,
  runnerId: IdentifierSchema,
  sessionId: IdentifierSchema,
  fence: PositiveFencingTokenSchema,
});

export const RUN_PERSISTENCE_CONTRACT_VERSION = 1 as const;

export const RunTerminalReasonSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

export const RunEventTypeSchema = z.enum([
  "lease_acquired",
  "heartbeat",
  "started",
  "lease_expired",
  "succeeded",
  "failed",
  "cancelled",
]);

export const PersistedRunSchema = z.strictObject({
  contractVersion: z.literal(RUN_PERSISTENCE_CONTRACT_VERSION),
  id: IdentifierSchema,
  actionId: IdentifierSchema,
  engagementId: IdentifierSchema,
  attempt: SafeIntegerSchema.positive(),
  state: RunStateSchema,
  currentLeaseId: IdentifierSchema.nullable(),
  currentFence: FencingTokenSchema,
  terminalKind: RunTerminalKindSchema.nullable(),
  terminalReason: RunTerminalReasonSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const PersistedRunEventSchema = z.strictObject({
  eventId: RunnerSequenceSchema,
  runId: IdentifierSchema,
  sequence: RunnerSequenceSchema,
  type: RunEventTypeSchema,
  fence: FencingTokenSchema,
  payloadJson: z.string().min(2).max(1_048_576),
  digest: RunnerEventDigestSchema,
  createdAt: TimestampSchema,
});

export const CreateQueuedRunInputSchema = z.strictObject({
  actionId: IdentifierSchema,
  engagementId: IdentifierSchema,
  attempt: SafeIntegerSchema.positive().optional(),
});

export const AcquireRunLeaseInputSchema = z.strictObject({
  runId: IdentifierSchema,
  runnerId: IdentifierSchema,
  sessionId: IdentifierSchema,
  serverNow: TimestampSchema,
});

export const PersistRunHeartbeatInputSchema = z.strictObject({
  presented: LeaseAuthorityPresentationSchema,
  heartbeatSequence: RunnerSequenceSchema,
  requestDigest: RunnerEventDigestSchema,
  serverNow: TimestampSchema,
});

export const ExpirePersistedRunLeaseInputSchema = z.strictObject({
  runId: IdentifierSchema,
  serverNow: TimestampSchema,
});

export const AppendPersistedRunEventInputSchema = z.strictObject({
  presented: LeaseAuthorityPresentationSchema,
  sequence: RunnerSequenceSchema,
  type: RunEventTypeSchema,
  payload: z.unknown().optional(),
  digest: RunnerEventDigestSchema.optional(),
  serverNow: TimestampSchema,
});

export const CompletePersistedRunInputSchema = z
  .strictObject({
    presented: LeaseAuthorityPresentationSchema.nullable(),
    runId: IdentifierSchema.optional(),
    sequence: RunnerSequenceSchema.optional(),
    terminalKind: RunTerminalKindSchema,
    reason: RunTerminalReasonSchema.nullable(),
    payload: z.unknown().optional(),
    digest: RunnerEventDigestSchema.optional(),
    serverNow: TimestampSchema,
  })
  .superRefine((input, context) => {
    if (input.presented === null && input.runId === undefined) {
      context.addIssue({
        code: "custom",
        message: "control-plane completion requires runId",
        path: ["runId"],
      });
    }
  });

export const RetryRunInputSchema = z.strictObject({
  actionId: IdentifierSchema,
});

export const ValidateLeaseAuthorityInputSchema = z.strictObject({
  lease: RunnerLeaseSchema,
  presented: LeaseAuthorityPresentationSchema,
  serverNow: TimestampSchema,
});

export const LeaseAuthorityResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), lease: RunnerLeaseSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        "invalid_runner_control_input",
        "lease_owner_mismatch",
        "stale_fence",
        "lease_expired",
      ]),
    }),
  }),
]);

export const IncrementFenceInputSchema = z.strictObject({
  currentFence: FencingTokenSchema,
});

export const IncrementFenceResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    nextFence: PositiveFencingTokenSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum(["invalid_runner_control_input", "fencing_exhausted"]),
    }),
  }),
]);

export const StoredHeartbeatSchema = z.strictObject({
  heartbeatSequence: RunnerSequenceSchema,
  requestDigest: RunnerEventDigestSchema,
  leaseExpiresAt: TimestampSchema,
});

export const AcceptHeartbeatInputSchema = z
  .strictObject({
    lease: RunnerLeaseSchema,
    presented: LeaseAuthorityPresentationSchema,
    heartbeatSequence: RunnerSequenceSchema,
    requestDigest: RunnerEventDigestSchema,
    serverNow: TimestampSchema,
    storedHeartbeat: StoredHeartbeatSchema.nullable(),
  })
  .superRefine((input, context) => {
    if (
      input.storedHeartbeat !== null &&
      input.storedHeartbeat.heartbeatSequence !== input.heartbeatSequence
    ) {
      context.addIssue({
        code: "custom",
        message: "stored heartbeat sequence mismatch",
        path: ["storedHeartbeat", "heartbeatSequence"],
      });
    }
  });

const AcceptedHeartbeatSchema = z.strictObject({
  heartbeatSequence: RunnerSequenceSchema,
  requestDigest: RunnerEventDigestSchema,
  leaseExpiresAt: TimestampSchema,
});

export const AcceptHeartbeatResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    disposition: z.literal("accepted"),
    lease: RunnerLeaseSchema,
    heartbeat: AcceptedHeartbeatSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    disposition: z.literal("stored_heartbeat_replayed"),
    leaseExpiresAt: TimestampSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        "invalid_runner_control_input",
        "lease_owner_mismatch",
        "stale_fence",
        "lease_expired",
        "heartbeat_replay_conflict",
        "heartbeat_sequence_stale",
      ]),
    }),
  }),
]);

export const RunTransitionInputSchema = z.strictObject({
  from: RunStateSchema,
  to: RunStateSchema,
});

export const RunTransitionResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), state: RunStateSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        "invalid_runner_control_input",
        "invalid_run_transition",
      ]),
    }),
  }),
]);

export const ExpireRunLeaseInputSchema = z.strictObject({
  actionState: ActionStateSchema,
  runState: RunStateSchema,
});

export const ExpireRunLeaseResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    actionState: ActionStateSchema,
    runState: RunStateSchema,
    terminal: z.boolean(),
    automaticallyRequeued: z.boolean(),
    reason: z.enum([
      "lease_expired",
      "runner_lost",
      "runner_lost_during_cancel",
    ]),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum([
        "invalid_runner_control_input",
        "invalid_run_transition",
      ]),
    }),
  }),
]);

export const StoredRunEventSchema = z
  .strictObject({
    kind: z.enum(["event", "completion"]),
    digest: RunnerEventDigestSchema,
    eventId: RunnerSequenceSchema,
    terminalKind: RunTerminalKindSchema.nullable(),
  })
  .superRefine((event, context) => {
    if (
      (event.kind === "event" && event.terminalKind !== null) ||
      (event.kind === "completion" && event.terminalKind === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "stored event kind and terminal kind disagree",
        path: ["terminalKind"],
      });
    }
  });

const RunnerEventSequenceBaseSchema = z.strictObject({
  lastAcceptedSequence: RunnerSequenceCursorSchema,
  presentedSequence: RunnerSequenceSchema,
  presentedDigest: RunnerEventDigestSchema,
  storedAtSequence: StoredRunEventSchema.nullable(),
  currentTerminalKind: RunTerminalKindSchema.nullable(),
});

export const EvaluateRunEventSequenceInputSchema = z.discriminatedUnion("kind", [
  RunnerEventSequenceBaseSchema.extend({ kind: z.literal("event") }),
  RunnerEventSequenceBaseSchema.extend({
    kind: z.literal("completion"),
    terminalKind: RunTerminalKindSchema,
  }),
]);

const AcceptedRunEventSequenceResultSchema = z.strictObject({
  ok: z.literal(true),
  disposition: z.enum(["accepted_event", "accepted_completion"]),
  eventId: z.null(),
  acceptedSequence: RunnerSequenceSchema,
  nextEventSequence: RunnerSequenceSchema,
});

const ReplayedRunEventSequenceResultSchema = z.strictObject({
  ok: z.literal(true),
  disposition: z.enum([
    "stored_event_replayed",
    "stored_terminal_replayed",
  ]),
  eventId: RunnerSequenceSchema,
  acceptedSequence: RunnerSequenceSchema,
  nextEventSequence: RunnerSequenceSchema.nullable(),
});

export const EvaluateRunEventSequenceResultSchema = z.union([
  AcceptedRunEventSequenceResultSchema,
  ReplayedRunEventSequenceResultSchema,
  z.strictObject({
    ok: z.literal(false),
    error: z.union([
      z.strictObject({ code: z.literal("invalid_runner_control_input") }),
      z.strictObject({ code: z.literal("event_replay_conflict") }),
      z.strictObject({ code: z.literal("run_already_terminal") }),
      z.strictObject({ code: z.literal("event_sequence_exhausted") }),
      z.strictObject({
        code: z.literal("event_sequence_gap"),
        expectedSequence: RunnerSequenceSchema,
      }),
    ]),
  }),
]);

export const SelectSseResumeInputSchema = z
  .strictObject({
    retainedEventIds: z.array(RunnerSequenceSchema),
    lastEventId: RunnerSequenceCursorSchema,
    currentWatermark: RunnerSequenceCursorSchema,
    snapshotUrl: z.string().min(1).max(2_048).startsWith("/api/v1/"),
  })
  .superRefine((input, context) => {
    for (let index = 1; index < input.retainedEventIds.length; index += 1) {
      if (
        (input.retainedEventIds[index - 1] as number) >=
        (input.retainedEventIds[index] as number)
      ) {
        context.addIssue({
          code: "custom",
          message: "retained event IDs must be sorted and unique",
          path: ["retainedEventIds", index],
        });
        return;
      }
    }
    if (
      input.retainedEventIds.some((eventId) => eventId > input.currentWatermark)
    ) {
      context.addIssue({
        code: "custom",
        message: "retained event exceeds watermark",
        path: ["retainedEventIds"],
      });
    }
    // D2 retains at least the newest events per engagement. An engagement
    // watermark therefore has a retained tail unless its stream is empty.
    if (
      (input.retainedEventIds.length === 0) !==
      (input.currentWatermark === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "retained events and engagement watermark disagree",
        path: ["currentWatermark"],
      });
    }
  });

const SnapshotUrlSchema = z.string().min(1).max(2_048).startsWith("/api/v1/");

export const SelectSseResumeResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    deliveredEventIds: z.array(RunnerSequenceSchema),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.union([
      z.strictObject({ code: z.literal("invalid_runner_control_input") }),
      z.strictObject({
        code: z.literal("sse_cursor_expired"),
        earliestEventId: RunnerSequenceSchema,
        snapshotUrl: SnapshotUrlSchema,
      }),
      z.strictObject({
        code: z.literal("sse_cursor_ahead"),
        currentWatermark: RunnerSequenceCursorSchema,
      }),
    ]),
  }),
]);

export const SelfFenceDeadlineInputSchema = z.strictObject({
  heartbeatRequestSentMonotonicMs: RunnerSequenceCursorSchema,
});

export const SelfFenceDeadlineResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    cleanupStartsMonotonicMs: RunnerSequenceCursorSchema,
    localFenceDeadlineMonotonicMs: RunnerSequenceCursorSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({ code: z.literal("invalid_runner_control_input") }),
  }),
]);

export type RunnerLease = z.infer<typeof RunnerLeaseSchema>;
export type LeaseAuthorityResult = z.infer<typeof LeaseAuthorityResultSchema>;
export type IncrementFenceResult = z.infer<typeof IncrementFenceResultSchema>;
export type AcceptHeartbeatResult = z.infer<typeof AcceptHeartbeatResultSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type RunTerminalKind = z.infer<typeof RunTerminalKindSchema>;
export type RunTransitionResult = z.infer<typeof RunTransitionResultSchema>;
export type ExpireRunLeaseResult = z.infer<typeof ExpireRunLeaseResultSchema>;
export type EvaluateRunEventSequenceResult = z.infer<
  typeof EvaluateRunEventSequenceResultSchema
>;
export type SelectSseResumeResult = z.infer<typeof SelectSseResumeResultSchema>;
export type SelfFenceDeadlineResult = z.infer<
  typeof SelfFenceDeadlineResultSchema
>;
export type PersistedRun = z.infer<typeof PersistedRunSchema>;
export type PersistedRunEvent = z.infer<typeof PersistedRunEventSchema>;
export type RunEventType = z.infer<typeof RunEventTypeSchema>;
export type CreateQueuedRunInput = z.infer<typeof CreateQueuedRunInputSchema>;
export type AcquireRunLeaseInput = z.infer<typeof AcquireRunLeaseInputSchema>;
export type PersistRunHeartbeatInput = z.infer<
  typeof PersistRunHeartbeatInputSchema
>;
export type ExpirePersistedRunLeaseInput = z.infer<
  typeof ExpirePersistedRunLeaseInputSchema
>;
export type AppendPersistedRunEventInput = z.infer<
  typeof AppendPersistedRunEventInputSchema
>;
export type CompletePersistedRunInput = z.infer<
  typeof CompletePersistedRunInputSchema
>;
export type RetryRunInput = z.infer<typeof RetryRunInputSchema>;
