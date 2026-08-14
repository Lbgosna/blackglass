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
