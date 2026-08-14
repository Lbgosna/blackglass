import { randomUUID } from "node:crypto";

import {
  AppendScopeRevisionInputSchema,
  CreateEngagementInputSchema,
  ENGAGEMENT_CONTRACT_VERSION,
  EngagementSchema,
  EngagementWithActiveScopeSchema,
  ScopeRevisionSchema,
  type AppendScopeRevisionInput,
  type CreateEngagementInput,
  type Engagement,
  type EngagementStatus,
  type EngagementWithActiveScope,
  type CanonicalUrlHost,
  type ScopeRevision,
  type SavedScopeRule,
} from "@blackglass/contracts";
import { normalizeScopeRules, normalizeTarget } from "@blackglass/domain";
import { and, asc, eq, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type * as schema from "./schema.js";
import {
  engagementActiveScopes,
  engagements,
  scopeRevisions,
  type EngagementRow,
  type ScopeRevisionRow,
} from "./schema.js";

export type RepositoryError =
  | { code: "engagement_archived" }
  | { code: "engagement_not_found" }
  | { code: "invalid_engagement_transition" }
  | { code: "invalid_persisted_data" }
  | { code: "invalid_repository_input" }
  | { code: "revision_conflict"; currentRevision: number }
  | { code: "storage_busy" };

export type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryError };

export interface RepositoryProviders {
  createId?: () => string;
  now?: () => Date;
}

type DatabaseSchema = typeof schema;
export type DatabaseWriteClient = Parameters<
  Parameters<BetterSQLite3Database<DatabaseSchema>["transaction"]>[0]
>[0];
export interface EngagementWriteTransaction {
  readonly client: DatabaseWriteClient;
  createEngagement(input: unknown): RepositoryResult<Engagement>;
  archive(
    engagementId: string,
    expectedRevision: number,
  ): RepositoryResult<Engagement>;
  reopen(
    engagementId: string,
    expectedRevision: number,
  ): RepositoryResult<Engagement>;
  updateAutoContinueWarnings(
    engagementId: string,
    expectedRevision: number,
    autoContinueWarnings: boolean,
  ): RepositoryResult<Engagement>;
  appendScopeRevision(input: unknown): RepositoryResult<ScopeRevision>;
}

function failed<T>(error: RepositoryError): RepositoryResult<T> {
  return { ok: false, error };
}

function isStorageBusy(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "SQLITE_BUSY" || error.code === "SQLITE_BUSY_TIMEOUT")
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function parseRules(rulesJson: string): unknown {
  try {
    return JSON.parse(rulesJson);
  } catch {
    return undefined;
  }
}

function canonicalUrlHostsEqual(
  left: CanonicalUrlHost,
  right: CanonicalUrlHost,
): boolean {
  if ("hostname" in left || "hostname" in right) {
    return (
      "hostname" in left &&
      "hostname" in right &&
      left.hostname === right.hostname
    );
  }
  return left.address === right.address && left.zone === right.zone;
}

function scopeRuleIsCanonical(rule: SavedScopeRule): boolean {
  if (rule.kind === "domain") {
    const normalized = normalizeTarget(rule.target.hostname);
    return (
      normalized.ok &&
      normalized.target.kind === "hostname" &&
      normalized.target.hostname === rule.target.hostname
    );
  }
  if (rule.kind === "url-origin") {
    const host =
      "hostname" in rule.origin.host
        ? rule.origin.host.hostname
        : rule.origin.host.address.includes(":")
          ? `[${rule.origin.host.address}${rule.origin.host.zone === null ? "" : `%25${rule.origin.host.zone}`}]`
          : rule.origin.host.address;
    const normalized = normalizeTarget(
      `${rule.origin.scheme}://${host}:${rule.origin.effectivePort}/`,
    );
    return (
      normalized.ok &&
      normalized.target.kind === "url" &&
      normalized.target.url.startsWith(`${rule.origin.scheme}://`) &&
      normalized.target.effectivePort === rule.origin.effectivePort &&
      canonicalUrlHostsEqual(rule.origin.host, normalized.target.host)
    );
  }
  const target = rule.target;
  const raw =
    target.kind === "cidr"
      ? `${target.network}/${target.prefixLength}`
      : target.zone === null
        ? target.address
        : `${target.address}%${target.zone}`;
  const normalized = normalizeTarget(raw);
  if (!normalized.ok || normalized.target.kind !== target.kind) return false;
  return target.kind === "cidr" && normalized.target.kind === "cidr"
    ? normalized.target.family === target.family &&
        normalized.target.network === target.network &&
        normalized.target.prefixLength === target.prefixLength
    : target.kind === "ip" &&
        normalized.target.kind === "ip" &&
        normalized.target.family === target.family &&
        normalized.target.address === target.address &&
        normalized.target.zone === target.zone;
}

function normalizeValidatedRules(
  rules: readonly SavedScopeRule[],
): ReturnType<typeof normalizeScopeRules> {
  const normalized = normalizeScopeRules(rules);
  if (!normalized.ok) return normalized;
  return normalized.rules.every(scopeRuleIsCanonical)
    ? normalized
    : { ok: false, error: { code: "invalid_scope_input" } };
}

function engagementFromRow(
  row: EngagementRow,
  activeScopeRevisionId: string | null,
): RepositoryResult<Engagement> {
  const parsed = EngagementSchema.safeParse({
    contractVersion: row.contractVersion,
    id: row.id,
    revision: row.revision,
    name: row.name,
    kind: row.kind,
    status: row.status,
    description: row.description,
    authorizationContext: row.authorizationContext,
    autoContinueWarnings: row.autoContinueWarnings,
    activeScopeRevisionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  return parsed.success
    ? { ok: true, value: parsed.data }
    : failed({ code: "invalid_persisted_data" });
}

function scopeRevisionFromRow(
  row: ScopeRevisionRow,
): RepositoryResult<ScopeRevision> {
  const parsed = ScopeRevisionSchema.safeParse({
    contractVersion: row.contractVersion,
    id: row.id,
    engagementId: row.engagementId,
    version: row.version,
    rules: parseRules(row.rulesJson),
    createdAt: row.createdAt,
  });
  if (!parsed.success) return failed({ code: "invalid_persisted_data" });
  const normalized = normalizeValidatedRules(parsed.data.rules);
  if (!normalized.ok || JSON.stringify(normalized.rules) !== row.rulesJson) {
    return failed({ code: "invalid_persisted_data" });
  }
  return { ok: true, value: parsed.data };
}

class TransactionRepository implements EngagementWriteTransaction {
  constructor(
    readonly client: DatabaseWriteClient,
    private readonly createId: () => string,
    private readonly now: () => Date,
  ) {}

  private currentEngagement(
    engagementId: string,
  ): RepositoryResult<EngagementRow> {
    const row = this.client
      .select()
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .get();
    return row === undefined
      ? failed({ code: "engagement_not_found" })
      : { ok: true, value: row };
  }

  createEngagement(input: unknown): RepositoryResult<Engagement> {
    const parsed = CreateEngagementInputSchema.safeParse(input);
    if (!parsed.success) return failed({ code: "invalid_repository_input" });
    const timestamp = this.now().toISOString();
    const row = {
      id: this.createId(),
      contractVersion: ENGAGEMENT_CONTRACT_VERSION,
      revision: 1,
      name: parsed.data.name,
      kind: parsed.data.kind,
      status: "active" as const,
      description: parsed.data.description,
      authorizationContext: parsed.data.authorizationContext,
      autoContinueWarnings: parsed.data.autoContinueWarnings,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const valid = EngagementSchema.safeParse({
      ...row,
      activeScopeRevisionId: null,
    });
    if (!valid.success) return failed({ code: "invalid_repository_input" });
    this.client.insert(engagements).values(row).run();
    return { ok: true, value: valid.data };
  }

  archive(
    engagementId: string,
    expectedRevision: number,
  ): RepositoryResult<Engagement> {
    return this.setStatus(engagementId, expectedRevision, "archived");
  }

  reopen(
    engagementId: string,
    expectedRevision: number,
  ): RepositoryResult<Engagement> {
    return this.setStatus(engagementId, expectedRevision, "active");
  }

  setStatus(
    engagementId: string,
    expectedRevision: number,
    status: EngagementStatus,
  ): RepositoryResult<Engagement> {
    const current = this.currentEngagement(engagementId);
    if (!current.ok) return current;
    if (current.value.revision !== expectedRevision) {
      return failed({
        code: "revision_conflict",
        currentRevision: current.value.revision,
      });
    }
    if (current.value.status === status) {
      return failed({ code: "invalid_engagement_transition" });
    }
    const updatedAt = this.now().toISOString();
    this.client
      .update(engagements)
      .set({ status, revision: expectedRevision + 1, updatedAt })
      .where(
        and(
          eq(engagements.id, engagementId),
          eq(engagements.revision, expectedRevision),
        ),
      )
      .run();
    return engagementFromRow(
      { ...current.value, status, revision: expectedRevision + 1, updatedAt },
      this.activeScopeId(engagementId),
    );
  }

  updateAutoContinueWarnings(
    engagementId: string,
    expectedRevision: number,
    autoContinueWarnings: boolean,
  ): RepositoryResult<Engagement> {
    const current = this.currentEngagement(engagementId);
    if (!current.ok) return current;
    if (current.value.revision !== expectedRevision) {
      return failed({
        code: "revision_conflict",
        currentRevision: current.value.revision,
      });
    }
    if (current.value.status === "archived") {
      return failed({ code: "engagement_archived" });
    }
    const updatedAt = this.now().toISOString();
    this.client
      .update(engagements)
      .set({
        autoContinueWarnings,
        revision: expectedRevision + 1,
        updatedAt,
      })
      .where(
        and(
          eq(engagements.id, engagementId),
          eq(engagements.revision, expectedRevision),
        ),
      )
      .run();
    return engagementFromRow(
      {
        ...current.value,
        autoContinueWarnings,
        revision: expectedRevision + 1,
        updatedAt,
      },
      this.activeScopeId(engagementId),
    );
  }

  appendScopeRevision(input: unknown): RepositoryResult<ScopeRevision> {
    const parsed = AppendScopeRevisionInputSchema.safeParse(input);
    if (!parsed.success) return failed({ code: "invalid_repository_input" });
    const normalized = normalizeValidatedRules(parsed.data.rules);
    if (!normalized.ok) return failed({ code: "invalid_repository_input" });
    const current = this.currentEngagement(parsed.data.engagementId);
    if (!current.ok) return current;
    if (current.value.revision !== parsed.data.expectedRevision) {
      return failed({
        code: "revision_conflict",
        currentRevision: current.value.revision,
      });
    }
    if (current.value.status === "archived") {
      return failed({ code: "engagement_archived" });
    }

    const latest = this.client
      .select({ version: max(scopeRevisions.version) })
      .from(scopeRevisions)
      .where(eq(scopeRevisions.engagementId, parsed.data.engagementId))
      .get();
    const timestamp = this.now().toISOString();
    const row = {
      id: this.createId(),
      contractVersion: ENGAGEMENT_CONTRACT_VERSION,
      engagementId: parsed.data.engagementId,
      version: (latest?.version ?? 0) + 1,
      rulesJson: JSON.stringify(normalized.rules),
      createdAt: timestamp,
    };
    const output = scopeRevisionFromRow(row);
    if (!output.ok) return failed({ code: "invalid_repository_input" });

    this.client.insert(scopeRevisions).values(row).run();
    this.client
      .insert(engagementActiveScopes)
      .values({
        engagementId: parsed.data.engagementId,
        scopeRevisionId: row.id,
      })
      .onConflictDoUpdate({
        target: engagementActiveScopes.engagementId,
        set: { scopeRevisionId: row.id },
      })
      .run();
    this.client
      .update(engagements)
      .set({ revision: parsed.data.expectedRevision + 1, updatedAt: timestamp })
      .where(
        and(
          eq(engagements.id, parsed.data.engagementId),
          eq(engagements.revision, parsed.data.expectedRevision),
        ),
      )
      .run();
    return output;
  }

  private activeScopeId(engagementId: string): string | null {
    return (
      this.client
        .select({ id: engagementActiveScopes.scopeRevisionId })
        .from(engagementActiveScopes)
        .where(eq(engagementActiveScopes.engagementId, engagementId))
        .get()?.id ?? null
    );
  }
}

export class EngagementRepository {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly db: BetterSQLite3Database<DatabaseSchema>,
    providers: RepositoryProviders = {},
  ) {
    this.createId = providers.createId ?? randomUUID;
    this.now = providers.now ?? (() => new Date());
  }

  private runMutation<T>(
    mutation: (repository: EngagementWriteTransaction) => RepositoryResult<T>,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<T> {
    if (transaction !== undefined) return mutation(transaction);
    try {
      return this.withWriteTx(mutation);
    } catch (error) {
      return failed({
        code: isStorageBusy(error) ? "storage_busy" : "invalid_persisted_data",
      });
    }
  }

  withWriteTx<T>(
    operation: (
      repository: EngagementWriteTransaction,
    ) => T extends PromiseLike<unknown> ? never : T,
  ): T;
  withWriteTx(operation: (repository: EngagementWriteTransaction) => unknown): unknown {
    return this.db.transaction(
      (transaction) => {
        const value = operation(
          new TransactionRepository(transaction, this.createId, this.now),
        );
        if (isPromiseLike(value)) {
          throw new TypeError("Write transaction callback must be synchronous.");
        }
        return value;
      },
      { behavior: "immediate" },
    );
  }

  createEngagement(
    input: CreateEngagementInput | unknown,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<Engagement> {
    return this.runMutation(
      (repository) => repository.createEngagement(input),
      transaction,
    );
  }

  archive(
    engagementId: string,
    expectedRevision: number,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<Engagement> {
    return this.runMutation(
      (repository) => repository.archive(engagementId, expectedRevision),
      transaction,
    );
  }

  reopen(
    engagementId: string,
    expectedRevision: number,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<Engagement> {
    return this.runMutation(
      (repository) => repository.reopen(engagementId, expectedRevision),
      transaction,
    );
  }

  updateAutoContinueWarnings(
    engagementId: string,
    expectedRevision: number,
    autoContinueWarnings: boolean,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<Engagement> {
    return this.runMutation(
      (repository) =>
        repository.updateAutoContinueWarnings(
          engagementId,
          expectedRevision,
          autoContinueWarnings,
        ),
      transaction,
    );
  }

  appendScopeRevision(
    input: AppendScopeRevisionInput | unknown,
    transaction?: EngagementWriteTransaction,
  ): RepositoryResult<ScopeRevision> {
    return this.runMutation(
      (repository) => repository.appendScopeRevision(input),
      transaction,
    );
  }

  getEngagement(engagementId: string): RepositoryResult<EngagementWithActiveScope> {
    try {
      const joined = this.db
        .select({
          engagement: engagements,
          activeScopeRevisionId: engagementActiveScopes.scopeRevisionId,
          activeScopeRevision: scopeRevisions,
        })
        .from(engagements)
        .leftJoin(
          engagementActiveScopes,
          eq(engagementActiveScopes.engagementId, engagements.id),
        )
        .leftJoin(
          scopeRevisions,
          eq(scopeRevisions.id, engagementActiveScopes.scopeRevisionId),
        )
        .where(eq(engagements.id, engagementId))
        .get();
      if (joined === undefined) return failed({ code: "engagement_not_found" });
      if (
        joined.activeScopeRevisionId !== null &&
        joined.activeScopeRevision === null
      ) {
        return failed({ code: "invalid_persisted_data" });
      }
      const activeScope =
        joined.activeScopeRevision === null
          ? { ok: true as const, value: null }
          : scopeRevisionFromRow(joined.activeScopeRevision);
      if (!activeScope.ok) return activeScope;
      const engagement = engagementFromRow(
        joined.engagement,
        activeScope.value?.id ?? null,
      );
      if (!engagement.ok) return engagement;
      const output = EngagementWithActiveScopeSchema.safeParse({
        engagement: engagement.value,
        activeScopeRevision: activeScope.value,
      });
      return output.success
        ? { ok: true, value: output.data }
        : failed({ code: "invalid_persisted_data" });
    } catch (error) {
      return failed({
        code: isStorageBusy(error) ? "storage_busy" : "invalid_persisted_data",
      });
    }
  }

  listEngagements(): RepositoryResult<Engagement[]> {
    try {
      const rows = this.db
        .select({
          engagement: engagements,
          activeScopeRevisionId: engagementActiveScopes.scopeRevisionId,
          joinedScopeRevisionId: scopeRevisions.id,
          joinedScopeEngagementId: scopeRevisions.engagementId,
        })
        .from(engagements)
        .leftJoin(
          engagementActiveScopes,
          eq(engagementActiveScopes.engagementId, engagements.id),
        )
        .leftJoin(
          scopeRevisions,
          eq(scopeRevisions.id, engagementActiveScopes.scopeRevisionId),
        )
        .orderBy(asc(engagements.createdAt), asc(engagements.id))
        .all();
      const values: Engagement[] = [];
      for (const row of rows) {
        if (
          row.activeScopeRevisionId !== null &&
          (row.activeScopeRevisionId !== row.joinedScopeRevisionId ||
            row.joinedScopeEngagementId !== row.engagement.id)
        ) {
          return failed({ code: "invalid_persisted_data" });
        }
        const parsed = engagementFromRow(
          row.engagement,
          row.activeScopeRevisionId,
        );
        if (!parsed.ok) return parsed;
        values.push(parsed.value);
      }
      return { ok: true, value: values };
    } catch (error) {
      return failed({
        code: isStorageBusy(error) ? "storage_busy" : "invalid_persisted_data",
      });
    }
  }

  listScopeRevisions(
    engagementId: string,
  ): RepositoryResult<ScopeRevision[]> {
    try {
      const rows = this.db
        .select()
        .from(scopeRevisions)
        .where(eq(scopeRevisions.engagementId, engagementId))
        .orderBy(asc(scopeRevisions.version))
        .all();
      if (
        rows.length === 0 &&
        this.db
          .select({ id: engagements.id })
          .from(engagements)
          .where(eq(engagements.id, engagementId))
          .get() === undefined
      ) {
        return failed({ code: "engagement_not_found" });
      }
      const values: ScopeRevision[] = [];
      for (const row of rows) {
        const parsed = scopeRevisionFromRow(row);
        if (!parsed.ok) return parsed;
        values.push(parsed.value);
      }
      return { ok: true, value: values };
    } catch (error) {
      return failed({
        code: isStorageBusy(error) ? "storage_busy" : "invalid_persisted_data",
      });
    }
  }
}
