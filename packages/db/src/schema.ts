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

export type EngagementRow = typeof engagements.$inferSelect;
export type ScopeRevisionRow = typeof scopeRevisions.$inferSelect;
