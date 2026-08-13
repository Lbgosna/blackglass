import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openEngagementDatabase } from "./database.js";
import { EngagementRepository } from "./repository.js";

const IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
  "10000000-0000-4000-8000-000000000007",
  "10000000-0000-4000-8000-000000000008",
] as const;

const fixtures: Array<{
  directory: string;
  database: ReturnType<typeof openEngagementDatabase>;
}> = [];

function createFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "blackglass-action-operator-"));
  chmodSync(directory, 0o700);
  const database = openEngagementDatabase({ dataDirectory: directory });
  let idIndex = 0;
  let clockTick = 0;
  const repository = new EngagementRepository(database.db, {
    createId: () => IDS[idIndex++] ?? "10000000-0000-4000-8000-000000000099",
    now: () => new Date(Date.UTC(2026, 7, 12, 12, clockTick++)),
  });
  fixtures.push({ directory, database });
  return { directory, database, repository };
}

afterEach(() => {
  while (fixtures.length > 0) {
    const fixture = fixtures.pop();
    if (fixture === undefined) continue;
    if (fixture.database.sqlite.open) fixture.database.close();
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

describe("operator action planning", () => {
  it("distinguishes a null scope from an active empty revision", () => {
    const { repository } = createFixture();
    const engagement = repository.createEngagement({
      name: "Target lab",
      kind: "lab",
      autoContinueWarnings: false,
    });
    if (!engagement.ok) throw new Error(engagement.error.code);

    const noScope = repository.planOperatorAction(engagement.value.id, {
      expectedEngagementRevision: 1,
      expectedActiveScopeRevisionId: null,
      targets: ["192.0.2.10"],
    });
    expect(noScope).toMatchObject({
      ok: true,
      value: {
        action: {
          state: "queued",
          snapshots: [{ scopeRevisionId: null, warningState: { reasonCodes: [] } }],
        },
      },
    });

    const empty = repository.appendScopeRevision({
      engagementId: engagement.value.id,
      expectedRevision: 1,
      rules: [],
    });
    if (!empty.ok) throw new Error(empty.error.code);
    expect(
      repository.planOperatorAction(engagement.value.id, {
        expectedEngagementRevision: 2,
        expectedActiveScopeRevisionId: null,
        targets: ["192.0.2.11"],
      }),
    ).toEqual({ ok: false, error: { code: "invalid_repository_input" } });

    const paused = repository.planOperatorAction(engagement.value.id, {
      expectedEngagementRevision: 2,
      expectedActiveScopeRevisionId: empty.value.id,
      targets: ["192.0.2.11"],
    });
    expect(paused).toMatchObject({
      ok: true,
      value: {
        action: {
          state: "paused_for_warning",
          snapshots: [
            {
              scopeRevisionId: empty.value.id,
              warningState: { reasonCodes: ["outside_scope"] },
            },
          ],
        },
      },
    });
  });

  it("adds one scope revision and snapshot version 2 atomically", () => {
    const { repository } = createFixture();
    const engagement = repository.createEngagement({
      name: "Target lab",
      kind: "lab",
      autoContinueWarnings: false,
    });
    if (!engagement.ok) throw new Error(engagement.error.code);
    const empty = repository.appendScopeRevision({
      engagementId: engagement.value.id,
      expectedRevision: 1,
      rules: [],
    });
    if (!empty.ok) throw new Error(empty.error.code);
    const paused = repository.planOperatorAction(engagement.value.id, {
      expectedEngagementRevision: 2,
      expectedActiveScopeRevisionId: empty.value.id,
      targets: ["192.0.2.20"],
    });
    if (!paused.ok) throw new Error(paused.error.code);

    const stale = repository.addScopeAndRunOperatorAction(
      engagement.value.id,
      paused.value.action.actionId,
      {
        expectedEngagementRevision: 1,
        expectedActionRevision: paused.value.revision,
        rules: [
          {
            id: "reserved-ip",
            kind: "ip",
            target: {
              kind: "ip",
              normalizationProfile: "d1-v1",
              family: 4,
              address: "192.0.2.20",
              zone: null,
            },
          },
        ],
      },
    );
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "revision_conflict", resourceType: "engagement" },
    });
    expect(repository.listScopeRevisions(engagement.value.id)).toMatchObject({
      ok: true,
      value: [{ version: 1, id: empty.value.id }],
    });

    const added = repository.addScopeAndRunOperatorAction(
      engagement.value.id,
      paused.value.action.actionId,
      {
        expectedEngagementRevision: 2,
        expectedActionRevision: paused.value.revision,
        rules: [
          {
            id: "reserved-ip",
            kind: "ip",
            target: {
              kind: "ip",
              normalizationProfile: "d1-v1",
              family: 4,
              address: "192.0.2.20",
              zone: null,
            },
          },
        ],
      },
    );
    expect(added).toMatchObject({
      ok: true,
      value: {
        action: {
          state: "queued",
          queuedSnapshotVersion: 2,
          warningAcknowledgment: { source: "add_scope_and_run" },
        },
      },
    });
    if (!added.ok) throw new Error("expected add-scope success");
    expect(added.value.action.snapshots).toHaveLength(2);
    expect(repository.listScopeRevisions(engagement.value.id)).toMatchObject({
      ok: true,
      value: [{ version: 1 }, { version: 2 }],
    });
  });
});
