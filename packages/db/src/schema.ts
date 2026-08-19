import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const engagements = sqliteTable(
  "engagements",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["ctf", "lab", "assessment"] }).notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull(),
    description: text("description"),
    authorizationContext: text("authorization_context"),
    autoContinueWarnings: integer("auto_continue_warnings", {
      mode: "boolean",
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("engagement_contract_version", sql`${table.contractVersion} = 1`),
    check("engagement_revision_positive", sql`${table.revision} >= 1`),
    check(
      "engagement_name_length",
      sql`length(${table.name}) between 1 and 120 and ${table.name} = trim(${table.name})`,
    ),
    check(
      "engagement_kind",
      sql`${table.kind} in ('ctf', 'lab', 'assessment')`,
    ),
    check(
      "engagement_status",
      sql`${table.status} in ('active', 'archived')`,
    ),
    check(
      "engagement_description_length",
      sql`${table.description} is null or length(${table.description}) <= 4096`,
    ),
    check(
      "engagement_authorization_context_length",
      sql`${table.authorizationContext} is null or length(${table.authorizationContext}) <= 4096`,
    ),
    check(
      "engagement_auto_continue_boolean",
      sql`${table.autoContinueWarnings} in (0, 1)`,
    ),
    index("engagement_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const scopeRevisions = sqliteTable(
  "scope_revisions",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    rulesJson: text("rules_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("scope_revision_contract_version", sql`${table.contractVersion} = 1`),
    check("scope_revision_version_positive", sql`${table.version} >= 1`),
    check("scope_revision_rules_json", sql`json_valid(${table.rulesJson})`),
    uniqueIndex("scope_revision_engagement_version_unique").on(
      table.engagementId,
      table.version,
    ),
    uniqueIndex("scope_revision_engagement_id_unique").on(
      table.engagementId,
      table.id,
    ),
  ],
);

export const engagementActiveScopes = sqliteTable(
  "engagement_active_scopes",
  {
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    scopeRevisionId: text("scope_revision_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.engagementId] }),
    foreignKey({
      columns: [table.engagementId, table.scopeRevisionId],
      foreignColumns: [scopeRevisions.engagementId, scopeRevisions.id],
      name: "active_scope_belongs_to_engagement",
    }).onDelete("restrict"),
  ],
);

export const operatorCommandIdempotency = sqliteTable(
  "operator_command_idempotency",
  {
    actorId: text("actor_id").notNull(),
    route: text("route").notNull(),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    canonicalizationProfile: text("canonicalization_profile").notNull(),
    requestDigest: text("request_digest").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBodyJson: text("response_body_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.actorId,
        table.route,
        table.operation,
        table.idempotencyKey,
      ],
    }),
    check(
      "operator_command_actor",
      sql`length(${table.actorId}) between 1 and 128 and ${table.actorId} not glob '*[^ -~]*'`,
    ),
    check(
      "operator_command_route",
      sql`length(${table.route}) between 1 and 2048 and ${table.route} glob '/api/v1/*' and ${table.route} not glob '*[^!-~]*' and ${table.route} not glob '*[?#]*'`,
    ),
    check(
      "operator_command_operation",
      sql`length(${table.operation}) between 1 and 64 and substr(${table.operation}, 1, 1) glob '[a-z]' and ${table.operation} not glob '*[^a-z0-9_]*'`,
    ),
    check(
      "operator_command_key",
      sql`length(${table.idempotencyKey}) between 22 and 128 and ${table.idempotencyKey} not glob '*[^ -~]*'`,
    ),
    check(
      "operator_command_profile",
      sql`${table.canonicalizationProfile} = 'command-json-v1'`,
    ),
    check(
      "operator_command_digest",
      sql`length(${table.requestDigest}) = 71 and ${table.requestDigest} glob 'sha256:[0-9a-f]*' and ${table.requestDigest} not glob 'sha256:*[^0-9a-f]*'`,
    ),
    check(
      "operator_command_response_status",
      sql`${table.responseStatus} between 200 and 599`,
    ),
    check(
      "operator_command_response_json",
      sql`json_valid(${table.responseBodyJson}) and length(cast(${table.responseBodyJson} as blob)) <= 1048576`,
    ),
    index("operator_command_created_at_idx").on(table.createdAt),
  ],
);

export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    state: text("state").notNull(),
    queuedSnapshotVersion: integer("queued_snapshot_version"),
    warningInteractions: integer("warning_interactions").notNull(),
    runState: text("run_state"),
    resumeRequested: integer("resume_requested", { mode: "boolean" }).notNull(),
    cleanupRequired: integer("cleanup_required", { mode: "boolean" }).notNull(),
    capabilityErrorCode: text("capability_error_code"),
    pendingWarningJson: text("pending_warning_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("action_contract_version", sql`${table.contractVersion} = 1`),
    check("action_revision_positive", sql`${table.revision} >= 1`),
    check(
      "action_id_length",
      sql`length(${table.id}) between 1 and 255`,
    ),
    check(
      "action_state",
      sql`${table.state} in ('planning', 'paused_for_warning', 'queued', 'active', 'active_paused_for_warning', 'succeeded', 'failed', 'cancelled', 'capability_error')`,
    ),
    check(
      "action_queued_snapshot_version",
      sql`${table.queuedSnapshotVersion} is null or ${table.queuedSnapshotVersion} >= 1`,
    ),
    check(
      "action_warning_interactions",
      sql`${table.warningInteractions} in (0, 1)`,
    ),
    check(
      "action_run_state",
      sql`${table.runState} is null or ${table.runState} in ('running', 'cancel_requested')`,
    ),
    check(
      "action_resume_boolean",
      sql`${table.resumeRequested} in (0, 1)`,
    ),
    check(
      "action_cleanup_boolean",
      sql`${table.cleanupRequired} in (0, 1)`,
    ),
    check(
      "action_capability_error",
      sql`${table.capabilityErrorCode} is null or ${table.capabilityErrorCode} in ('capability_error', 'required_resolution_unavailable', 'target_set_unrepresentable')`,
    ),
    check(
      "action_pending_warning_json",
      sql`${table.pendingWarningJson} is null or (json_valid(${table.pendingWarningJson}) and length(cast(${table.pendingWarningJson} as blob)) <= 1048576)`,
    ),
    uniqueIndex("action_engagement_id_unique").on(table.engagementId, table.id),
    index("action_engagement_created_idx").on(table.engagementId, table.createdAt),
  ],
);

export const actionSnapshots = sqliteTable(
  "action_snapshots",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    actionId: text("action_id").notNull(),
    engagementId: text("engagement_id").notNull(),
    version: integer("version").notNull(),
    binding: text("binding").notNull(),
    canonicalizationProfile: text("canonicalization_profile").notNull(),
    scopeRevisionId: text("scope_revision_id"),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("action_snapshot_contract_version", sql`${table.contractVersion} = 1`),
    check("action_snapshot_version_positive", sql`${table.version} >= 1`),
    check(
      "action_snapshot_id_length",
      sql`length(${table.id}) between 1 and 255`,
    ),
    check(
      "action_snapshot_profile",
      sql`${table.canonicalizationProfile} = 'action-snapshot-json-v1'`,
    ),
    check(
      "action_snapshot_binding",
      sql`length(${table.binding}) = 71 and ${table.binding} glob 'sha256:[0-9a-f]*' and ${table.binding} not glob 'sha256:*[^0-9a-f]*'`,
    ),
    check(
      "action_snapshot_json",
      sql`json_valid(${table.snapshotJson}) and length(cast(${table.snapshotJson} as blob)) <= 1048576`,
    ),
    uniqueIndex("action_snapshot_action_version_unique").on(
      table.actionId,
      table.version,
    ),
    uniqueIndex("action_snapshot_action_id_unique").on(table.actionId, table.id),
    uniqueIndex("action_snapshot_engagement_id_unique").on(
      table.engagementId,
      table.id,
    ),
    foreignKey({
      columns: [table.engagementId, table.actionId],
      foreignColumns: [actions.engagementId, actions.id],
      name: "action_snapshot_belongs_to_action",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.engagementId, table.scopeRevisionId],
      foreignColumns: [scopeRevisions.engagementId, scopeRevisions.id],
      name: "action_snapshot_scope_belongs_to_engagement",
    }).onDelete("restrict"),
  ],
);

export const actionWarningAcknowledgments = sqliteTable(
  "action_warning_acknowledgments",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    actionId: text("action_id").notNull(),
    engagementId: text("engagement_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    snapshotBinding: text("snapshot_binding").notNull(),
    scopeRevisionId: text("scope_revision_id"),
    reasonCodesJson: text("reason_codes_json").notNull(),
    knownAdditionsJson: text("known_additions_json").notNull(),
    source: text("source").notNull(),
    acknowledgedAt: text("acknowledged_at").notNull(),
    pendingEventId: integer("pending_event_id"),
  },
  (table) => [
    check(
      "action_warning_acknowledgment_contract_version",
      sql`${table.contractVersion} = 1`,
    ),
    check(
      "action_warning_acknowledgment_id_length",
      sql`length(${table.id}) between 1 and 255`,
    ),
    check(
      "action_warning_acknowledgment_snapshot_version",
      sql`${table.snapshotVersion} >= 1`,
    ),
    check(
      "action_warning_acknowledgment_binding",
      sql`length(${table.snapshotBinding}) = 71 and ${table.snapshotBinding} glob 'sha256:[0-9a-f]*' and ${table.snapshotBinding} not glob 'sha256:*[^0-9a-f]*'`,
    ),
    check(
      "action_warning_acknowledgment_source",
      sql`${table.source} in ('operator_continue', 'add_scope_and_run', 'engagement_policy')`,
    ),
    check(
      "action_warning_acknowledgment_pending_event",
      sql`${table.pendingEventId} is null or ${table.pendingEventId} >= 1`,
    ),
    check(
      "action_warning_acknowledgment_reason_codes_json",
      sql`json_valid(${table.reasonCodesJson}) and length(cast(${table.reasonCodesJson} as blob)) <= 1048576`,
    ),
    check(
      "action_warning_acknowledgment_known_additions_json",
      sql`json_valid(${table.knownAdditionsJson}) and length(cast(${table.knownAdditionsJson} as blob)) <= 1048576`,
    ),
    uniqueIndex("action_warning_acknowledgment_action_unique").on(table.actionId),
    uniqueIndex("action_warning_acknowledgment_engagement_id_unique").on(
      table.engagementId,
      table.id,
    ),
    uniqueIndex("action_warning_acknowledgment_action_id_unique").on(
      table.actionId,
      table.id,
    ),
    foreignKey({
      columns: [table.engagementId, table.actionId],
      foreignColumns: [actions.engagementId, actions.id],
      name: "action_warning_acknowledgment_belongs_to_action",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actionId, table.snapshotId],
      foreignColumns: [actionSnapshots.actionId, actionSnapshots.id],
      name: "action_warning_acknowledgment_binds_snapshot",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.engagementId, table.scopeRevisionId],
      foreignColumns: [scopeRevisions.engagementId, scopeRevisions.id],
      name: "action_warning_acknowledgment_scope_belongs_to_engagement",
    }).onDelete("restrict"),
  ],
);

export const actionCoveredDestinations = sqliteTable(
  "action_covered_destinations",
  {
    actionId: text("action_id").notNull(),
    engagementId: text("engagement_id").notNull(),
    acknowledgmentId: text("acknowledgment_id").notNull(),
    sequence: integer("sequence").notNull(),
    destinationJson: text("destination_json").notNull(),
    reasonCodesJson: text("reason_codes_json").notNull(),
    acknowledgedCover: integer("acknowledged_cover", {
      mode: "boolean",
    }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.actionId, table.sequence] }),
    check(
      "action_covered_destination_sequence",
      sql`${table.sequence} >= 1`,
    ),
    check(
      "action_covered_destination_ack_cover",
      sql`${table.acknowledgedCover} in (0, 1)`,
    ),
    check(
      "action_covered_destination_json",
      sql`json_valid(${table.destinationJson}) and length(cast(${table.destinationJson} as blob)) <= 1048576`,
    ),
    check(
      "action_covered_destination_reason_codes_json",
      sql`json_valid(${table.reasonCodesJson}) and length(cast(${table.reasonCodesJson} as blob)) <= 1048576`,
    ),
    foreignKey({
      columns: [table.engagementId, table.actionId],
      foreignColumns: [actions.engagementId, actions.id],
      name: "action_covered_destination_belongs_to_action",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actionId, table.acknowledgmentId],
      foreignColumns: [
        actionWarningAcknowledgments.actionId,
        actionWarningAcknowledgments.id,
      ],
      name: "action_covered_destination_belongs_to_acknowledgment",
    }).onDelete("restrict"),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    actionId: text("action_id").notNull(),
    engagementId: text("engagement_id").notNull(),
    attempt: integer("attempt").notNull(),
    state: text("state", {
      enum: [
        "queued",
        "leased",
        "running",
        "cancel_requested",
        "succeeded",
        "failed",
        "cancelled",
      ],
    }).notNull(),
    currentLeaseId: text("current_lease_id"),
    currentFence: text("current_fence").notNull(),
    terminalKind: text("terminal_kind", {
      enum: ["succeeded", "failed", "cancelled"],
    }),
    terminalReason: text("terminal_reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("run_contract_version", sql`${table.contractVersion} = 1`),
    check("run_id_length", sql`length(${table.id}) between 1 and 255`),
    check(
      "run_attempt_safe_positive",
      sql`${table.attempt} between 1 and 9007199254740991`,
    ),
    check(
      "run_state",
      sql`${table.state} in ('queued', 'leased', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "run_current_fence_canonical_int64",
      sql`length(${table.currentFence}) between 1 and 19 and ${table.currentFence} not glob '*[^0-9]*' and (${table.currentFence} = '0' or substr(${table.currentFence}, 1, 1) between '1' and '9') and (length(${table.currentFence}) < 19 or ${table.currentFence} <= '9223372036854775807')`,
    ),
    check(
      "run_positive_fence_after_queue",
      sql`${table.currentFence} <> '0' or ${table.state} in ('queued', 'cancelled')`,
    ),
    check(
      "run_terminal_fields",
      sql`(
        ${table.state} = 'succeeded' and ${table.terminalKind} = 'succeeded' and ${table.terminalReason} is null
      ) or (
        ${table.state} in ('failed', 'cancelled') and ${table.terminalKind} = ${table.state} and ${table.terminalReason} is not null
      ) or (
        ${table.state} not in ('succeeded', 'failed', 'cancelled') and ${table.terminalKind} is null and ${table.terminalReason} is null
      )`,
    ),
    check(
      "run_terminal_reason",
      sql`${table.terminalReason} is null or (length(${table.terminalReason}) between 1 and 64 and substr(${table.terminalReason}, 1, 1) glob '[a-z]' and ${table.terminalReason} not glob '*[^a-z0-9_]*')`,
    ),
    uniqueIndex("run_action_attempt_unique").on(table.actionId, table.attempt),
    uniqueIndex("run_engagement_id_unique").on(table.engagementId, table.id),
    uniqueIndex("run_action_nonterminal_unique")
      .on(table.actionId)
      .where(
        sql`${table.state} not in ('succeeded', 'failed', 'cancelled')`,
      ),
    index("run_queue_order_idx").on(table.state, table.createdAt, table.id),
    foreignKey({
      columns: [table.engagementId, table.actionId],
      foreignColumns: [actions.engagementId, actions.id],
      name: "run_belongs_to_action",
    }).onDelete("restrict"),
  ],
);

export const runLeases = sqliteTable(
  "run_leases",
  {
    leaseId: text("lease_id").primaryKey(),
    contractVersion: integer("contract_version").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "restrict" }),
    runnerId: text("runner_id").notNull(),
    sessionId: text("session_id").notNull(),
    fence: text("fence").notNull(),
    expiresAt: text("expires_at").notNull(),
    latestHeartbeatSequence: integer("latest_heartbeat_sequence").notNull(),
    latestEventSequence: integer("latest_event_sequence").notNull(),
    latestHeartbeatDigest: text("latest_heartbeat_digest"),
    current: integer("current", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("run_lease_contract_version", sql`${table.contractVersion} = 1`),
    check(
      "run_lease_id_length",
      sql`length(${table.leaseId}) between 1 and 255`,
    ),
    check(
      "run_lease_runner_id_length",
      sql`length(${table.runnerId}) between 1 and 255`,
    ),
    check(
      "run_lease_session_id_length",
      sql`length(${table.sessionId}) between 1 and 255`,
    ),
    check(
      "run_lease_fence_canonical_int64",
      sql`length(${table.fence}) between 1 and 19 and ${table.fence} not glob '*[^0-9]*' and substr(${table.fence}, 1, 1) between '1' and '9' and (length(${table.fence}) < 19 or ${table.fence} <= '9223372036854775807')`,
    ),
    check(
      "run_lease_heartbeat_sequence",
      sql`${table.latestHeartbeatSequence} between 0 and 9007199254740991`,
    ),
    check(
      "run_lease_event_sequence",
      sql`${table.latestEventSequence} between 0 and 9007199254740991`,
    ),
    check(
      "run_lease_heartbeat_digest",
      sql`${table.latestHeartbeatDigest} is null or (length(${table.latestHeartbeatDigest}) = 71 and ${table.latestHeartbeatDigest} glob 'sha256:[0-9a-f]*' and ${table.latestHeartbeatDigest} not glob 'sha256:*[^0-9a-f]*')`,
    ),
    check("run_lease_current_boolean", sql`${table.current} in (0, 1)`),
    uniqueIndex("run_lease_run_fence_unique").on(table.runId, table.fence),
    uniqueIndex("run_lease_identity_unique").on(
      table.leaseId,
      table.runId,
      table.fence,
    ),
    uniqueIndex("run_lease_current_run_unique")
      .on(table.runId)
      .where(sql`${table.current} = 1`),
    index("run_lease_runner_current_idx").on(
      table.runnerId,
      table.sessionId,
      table.current,
      table.expiresAt,
    ),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    eventId: integer("event_id").primaryKey({ autoIncrement: true }),
    contractVersion: integer("contract_version").notNull(),
    runId: text("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: text("type", {
      enum: [
        "lease_acquired",
        "heartbeat",
        "started",
        "lease_expired",
        "succeeded",
        "failed",
        "cancelled",
      ],
    }).notNull(),
    fence: text("fence").notNull(),
    payloadJson: text("payload_json").notNull(),
    digest: text("digest").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("run_event_contract_version", sql`${table.contractVersion} = 1`),
    check(
      "run_event_id_safe_positive",
      sql`${table.eventId} between 1 and 9007199254740991`,
    ),
    check(
      "run_event_sequence_safe_positive",
      sql`${table.sequence} between 1 and 9007199254740991`,
    ),
    check(
      "run_event_type",
      sql`${table.type} in ('lease_acquired', 'heartbeat', 'started', 'lease_expired', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "run_event_fence_canonical_int64",
      sql`length(${table.fence}) between 1 and 19 and ${table.fence} not glob '*[^0-9]*' and substr(${table.fence}, 1, 1) between '1' and '9' and (length(${table.fence}) < 19 or ${table.fence} <= '9223372036854775807')`,
    ),
    check(
      "run_event_payload_json",
      sql`json_valid(${table.payloadJson}) and length(cast(${table.payloadJson} as blob)) <= 1048576`,
    ),
    check(
      "run_event_digest",
      sql`length(${table.digest}) = 71 and ${table.digest} glob 'sha256:[0-9a-f]*' and ${table.digest} not glob 'sha256:*[^0-9a-f]*'`,
    ),
    uniqueIndex("run_event_run_type_sequence_unique").on(
      table.runId,
      table.fence,
      table.type,
      table.sequence,
    ),
    uniqueIndex("run_event_runner_sequence_unique")
      .on(table.runId, table.fence, table.sequence)
      .where(
        sql`${table.type} in ('started', 'succeeded', 'failed', 'cancelled')`,
      ),
    index("run_event_run_created_idx").on(table.runId, table.eventId),
    foreignKey({
      columns: [table.runId],
      foreignColumns: [runs.id],
      name: "run_event_belongs_to_run",
    }).onDelete("restrict"),
  ],
);

export type EngagementRow = typeof engagements.$inferSelect;
export type ScopeRevisionRow = typeof scopeRevisions.$inferSelect;
export type OperatorCommandIdempotencyRow =
  typeof operatorCommandIdempotency.$inferSelect;
export type ActionRow = typeof actions.$inferSelect;
export type ActionSnapshotRow = typeof actionSnapshots.$inferSelect;
export type ActionWarningAcknowledgmentRow =
  typeof actionWarningAcknowledgments.$inferSelect;
export type ActionCoveredDestinationRow =
  typeof actionCoveredDestinations.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type RunLeaseRow = typeof runLeases.$inferSelect;
export type RunEventRow = typeof runEvents.$inferSelect;
