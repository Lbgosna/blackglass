import { z } from "zod";

import {
  ActionPlanningAggregateSchema,
  ActionSnapshotBindingSchema,
  ActionSnapshotSchema,
  LateWarningInputSchema,
  PlanActionInputSchema,
} from "./action-planning.js";
import { EngagementSchema } from "./engagement.js";

export const ACTION_PERSISTENCE_CONTRACT_VERSION = 1 as const;

const ActionIdentifierSchema = ActionPlanningAggregateSchema.shape.actionId;
const TimestampSchema = PlanActionInputSchema.shape.occurredAt;

export const PersistedActionSchema = z.strictObject({
  contractVersion: z.literal(ACTION_PERSISTENCE_CONTRACT_VERSION),
  engagementId: EngagementSchema.shape.id,
  revision: z.number().int().positive(),
  warningAcknowledgmentId: ActionIdentifierSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  action: ActionPlanningAggregateSchema,
});

export const PersistPlannedActionInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  snapshot: ActionSnapshotSchema,
  representable: PlanActionInputSchema.shape.representable,
  capabilityErrorCode: PlanActionInputSchema.shape.capabilityErrorCode,
  occurredAt: TimestampSchema,
});

export const MutatePersistedActionInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  actionId: ActionIdentifierSchema,
  expectedRevision: z.number().int().positive(),
});

export const ContinuePersistedActionInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  actionId: ActionIdentifierSchema,
  expectedRevision: z.number().int().positive(),
  snapshotVersion: z.number().int().positive(),
  snapshotBinding: ActionSnapshotBindingSchema,
  occurredAt: TimestampSchema,
});

export const AddScopeAndRunPersistedActionInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  actionId: ActionIdentifierSchema,
  expectedRevision: z.number().int().positive(),
  recheckedSnapshot: ActionSnapshotSchema,
  occurredAt: TimestampSchema,
});

export const ActivatePersistedActionInputSchema = MutatePersistedActionInputSchema;

export const CancelPersistedActionInputSchema = MutatePersistedActionInputSchema;

export const RecordPersistedLateWarningInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  actionId: ActionIdentifierSchema,
  expectedRevision: z.number().int().positive(),
  runState: LateWarningInputSchema.shape.runState,
  snapshotVersion: LateWarningInputSchema.shape.snapshotVersion,
  snapshotBinding: LateWarningInputSchema.shape.snapshotBinding,
  reasonCodes: LateWarningInputSchema.shape.reasonCodes,
  addition: LateWarningInputSchema.shape.addition,
  pendingEventId: LateWarningInputSchema.shape.pendingEventId,
  occurredAt: LateWarningInputSchema.shape.occurredAt,
});

export const ContinuePersistedLateWarningInputSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
  actionId: ActionIdentifierSchema,
  expectedRevision: z.number().int().positive(),
  snapshotVersion: z.number().int().positive(),
  snapshotBinding: ActionSnapshotBindingSchema,
  pendingEventId: z.number().int().positive(),
  occurredAt: TimestampSchema,
});

export type PersistedAction = z.infer<typeof PersistedActionSchema>;
export type PersistPlannedActionInput = z.infer<
  typeof PersistPlannedActionInputSchema
>;
export type ContinuePersistedActionInput = z.infer<
  typeof ContinuePersistedActionInputSchema
>;
export type AddScopeAndRunPersistedActionInput = z.infer<
  typeof AddScopeAndRunPersistedActionInputSchema
>;
export type ActivatePersistedActionInput = z.infer<
  typeof ActivatePersistedActionInputSchema
>;
export type CancelPersistedActionInput = z.infer<
  typeof CancelPersistedActionInputSchema
>;
export type RecordPersistedLateWarningInput = z.infer<
  typeof RecordPersistedLateWarningInputSchema
>;
export type ContinuePersistedLateWarningInput = z.infer<
  typeof ContinuePersistedLateWarningInputSchema
>;
