import { z } from "zod";

import { ActionSnapshotSchema } from "./action-planning.js";
import { canonicalizeJson, type CanonicalJsonResult } from "./operator-command.js";

export const ACTION_SNAPSHOT_CANONICALIZATION_PROFILE =
  "action-snapshot-json-v1" as const;

export const ACTION_SNAPSHOT_HASH_FIELDS = [
  "actionId",
  "canonicalTargets",
  "typedOptions",
  "resolutionSnapshots",
  "scopeRevisionId",
  "warningState",
] as const;

export const ActionSnapshotDigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/);

export const ActionSnapshotCanonicalFieldsSchema = z.strictObject({
  actionId: ActionSnapshotSchema.shape.actionId,
  canonicalTargets: ActionSnapshotSchema.shape.canonicalTargets,
  typedOptions: ActionSnapshotSchema.shape.typedOptions,
  resolutionSnapshots: ActionSnapshotSchema.shape.resolutionSnapshots,
  scopeRevisionId: ActionSnapshotSchema.shape.scopeRevisionId,
  warningState: ActionSnapshotSchema.shape.warningState,
});

export const ActionSnapshotCanonicalEnvelopeSchema = z.strictObject({
  canonicalizationProfile: z.literal(ACTION_SNAPSHOT_CANONICALIZATION_PROFILE),
  actionId: ActionSnapshotCanonicalFieldsSchema.shape.actionId,
  canonicalTargets: ActionSnapshotCanonicalFieldsSchema.shape.canonicalTargets,
  typedOptions: ActionSnapshotCanonicalFieldsSchema.shape.typedOptions,
  resolutionSnapshots:
    ActionSnapshotCanonicalFieldsSchema.shape.resolutionSnapshots,
  scopeRevisionId: ActionSnapshotCanonicalFieldsSchema.shape.scopeRevisionId,
  warningState: ActionSnapshotCanonicalFieldsSchema.shape.warningState,
});

export type ActionSnapshotCanonicalFields = z.infer<
  typeof ActionSnapshotCanonicalFieldsSchema
>;
export type ActionSnapshotCanonicalEnvelope = z.infer<
  typeof ActionSnapshotCanonicalEnvelopeSchema
>;

export function actionSnapshotCanonicalEnvelope(
  fields: ActionSnapshotCanonicalFields,
): ActionSnapshotCanonicalEnvelope {
  return {
    canonicalizationProfile: ACTION_SNAPSHOT_CANONICALIZATION_PROFILE,
    actionId: fields.actionId,
    canonicalTargets: fields.canonicalTargets,
    typedOptions: fields.typedOptions,
    resolutionSnapshots: fields.resolutionSnapshots,
    scopeRevisionId: fields.scopeRevisionId,
    warningState: fields.warningState,
  };
}

export function canonicalizeActionSnapshot(input: unknown): CanonicalJsonResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: { code: "canonical_value_unsupported" } };
  }
  const record = input as Record<string, unknown>;
  const parsed = ActionSnapshotCanonicalFieldsSchema.safeParse({
    actionId: record.actionId,
    canonicalTargets: record.canonicalTargets,
    typedOptions: record.typedOptions,
    resolutionSnapshots: record.resolutionSnapshots,
    scopeRevisionId: record.scopeRevisionId,
    warningState: record.warningState,
  });
  if (!parsed.success) {
    return { ok: false, error: { code: "canonical_value_unsupported" } };
  }
  return canonicalizeJson(actionSnapshotCanonicalEnvelope(parsed.data));
}
