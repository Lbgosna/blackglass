import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d2/canonical-request.json" with {
  type: "json",
};
import {
  type JsonValue,
} from "@blackglass/contracts";
import {
  EngagementRepository,
  OperatorCommandRepository,
  openEngagementDatabase,
} from "@blackglass/db";
import {
  LOCAL_OPERATOR_ACTOR_ID,
  executeOperatorMutation,
  prepareLocalOperatorCommand,
} from "./operator-command.js";

interface CommandFixture {
  id: string;
  given: {
    value: {
      route: string;
      operation: string;
      path: JsonValue;
      query: JsonValue;
      body: JsonValue;
    };
  };
  expected: { digest: string };
}

const commandFixtures = (fixtureData as { cases: CommandFixture[] }).cases.filter(
  (fixtureCase) => "route" in fixtureCase.given.value,
);

describe("local operator command preparation", () => {
  it("binds server-owned identity and exact fixture digests", () => {
    for (const fixtureCase of commandFixtures) {
      const value = fixtureCase.given.value;
      expect(
        prepareLocalOperatorCommand({
          key: "fixture-idempotency-key-0001",
          route: value.route,
          operation: value.operation,
          path: value.path,
          query: value.query,
          body: value.body,
        }),
        fixtureCase.id,
      ).toEqual({
        ok: true,
        command: {
          actorId: LOCAL_OPERATOR_ACTOR_ID,
          route: value.route,
          operation: value.operation,
          idempotencyKey: "fixture-idempotency-key-0001",
          canonicalizationProfile: "command-json-v1",
          requestDigest: fixtureCase.expected.digest,
        },
      });
    }
  });

  it("binds path, query, body, route, and operation independently", () => {
    const base = {
      key: "fixture-idempotency-key-0001",
      route: "/api/v1/engagements",
      operation: "create",
      path: {},
      query: {},
      body: { value: null },
    };
    const prepared = prepareLocalOperatorCommand(base);
    if (!prepared.ok) throw new Error("Fixture preparation failed.");
    for (const changed of [
      { ...base, route: "/api/v1/engagements/fixture" },
      { ...base, operation: "archive" },
      { ...base, path: { id: "fixture" } },
      { ...base, query: { mode: "fixture" } },
      { ...base, body: {} },
    ]) {
      const result = prepareLocalOperatorCommand(changed);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.command.requestDigest).not.toBe(prepared.command.requestDigest);
      }
    }
  });

  it("rejects invalid keys, routes, operations, and semantic values without reflection", () => {
    const marker = "SENSITIVE_UNTRUSTED_MARKER";
    const compileTimeOnly = (): void => {
      prepareLocalOperatorCommand({
        key: "fixture-idempotency-key-0001",
        route: "/api/v1/engagements",
        operation: "create",
        path: {},
        query: {},
        // @ts-expect-error Callers must pass successful JSON schema outputs.
        body: { value: undefined },
      });
    };
    expect(compileTimeOnly).toBeTypeOf("function");
    for (const input of [
      {
        key: "short",
        route: "/api/v1/engagements",
        operation: "create",
        path: {},
        query: {},
        body: {},
      },
      {
        key: "fixture-idempotency-key-0001",
        route: `/api/v1/engagements?${marker}`,
        operation: "create",
        path: {},
        query: {},
        body: {},
      },
      {
        key: "fixture-idempotency-key-0001",
        route: "/api/v1/engagements",
        operation: "Create",
        path: {},
        query: {},
        body: {},
      },
      {
        key: "fixture-idempotency-key-0001",
        route: "/api/v1/engagements",
        operation: "create",
        path: {},
        query: {},
        body: { value: undefined },
      },
    ]) {
      const result = Reflect.apply(prepareLocalOperatorCommand, undefined, [input]);
      expect(result).toEqual({
        ok: false,
        error: { code: "invalid_command_input" },
      });
      expect(JSON.stringify(result)).not.toContain(marker);
    }
  });
});

const commandFixturesDirs: string[] = [];
const commandDatabases: ReturnType<typeof openEngagementDatabase>[] = [];

function commandRepositoryFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "blackglass-command-seam-"));
  commandFixturesDirs.push(directory);
  chmodSync(directory, 0o700);
  const database = openEngagementDatabase({ dataDirectory: directory });
  commandDatabases.push(database);
  const engagementRepository = new EngagementRepository(database.db, {
    createId: () => "10000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-08-12T12:00:00.000Z"),
  });
  const commandRepository = new OperatorCommandRepository(engagementRepository, {
    now: () => new Date("2026-08-12T12:01:00.000Z"),
  });
  return { commandRepository };
}

afterEach(() => {
  for (const database of commandDatabases.splice(0)) {
    if (database.sqlite.open) database.close();
  }
  for (const directory of commandFixturesDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("operator mutation digest lookup", () => {
  const input = {
    key: "fixture-idempotency-key-0001",
    route: "/api/v1/engagements",
    operation: "create",
    path: {},
    query: {},
    body: { name: "Target lab", kind: "lab", autoContinueWarnings: false },
  };

  it("replays the stored response without invoking the absent-path validator", () => {
    const { commandRepository } = commandRepositoryFixture();
    const applied = executeOperatorMutation(
      commandRepository,
      input,
      (transaction) => {
        const created = transaction.createEngagement(input.body);
        if (!created.ok) throw new Error(`Fixture failed: ${created.error.code}`);
        return { status: 201, body: { id: created.value.id } };
      },
    );
    expect(applied).toMatchObject({ ok: true, disposition: "applied" });

    let validatorCalls = 0;
    const replayed = executeOperatorMutation(
      commandRepository,
      input,
      () => {
        validatorCalls += 1;
        throw new Error("absent-path validator must not run on exact replay");
      },
    );
    expect(replayed).toEqual(
      applied.ok ? { ...applied, disposition: "replayed" } : applied,
    );
    expect(validatorCalls).toBe(0);
  });

  it("conflicts on another bounded digest before the absent-path validator", () => {
    const { commandRepository } = commandRepositoryFixture();
    expect(
      executeOperatorMutation(commandRepository, input, () => ({
        status: 201,
        body: { stored: true },
      })),
    ).toMatchObject({ ok: true, disposition: "applied" });

    let validatorCalls = 0;
    expect(
      executeOperatorMutation(
        commandRepository,
        { ...input, body: { name: "Other lab", kind: "lab", autoContinueWarnings: false } },
        () => {
          validatorCalls += 1;
          throw new Error("absent-path validator must not run on digest conflict");
        },
      ),
    ).toEqual({ ok: false, error: { code: "idempotency_conflict" } });
    expect(validatorCalls).toBe(0);
  });
});
