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

export type EngagementRow = typeof engagements.$inferSelect;
export type ScopeRevisionRow = typeof scopeRevisions.$inferSelect;
export type OperatorCommandIdempotencyRow =
  typeof operatorCommandIdempotency.$inferSelect;
