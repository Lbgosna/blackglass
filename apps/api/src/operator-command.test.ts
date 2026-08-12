import { describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d2/canonical-request.json" with {
  type: "json",
};
import {
  type JsonValue,
} from "@blackglass/contracts";
import {
  LOCAL_OPERATOR_ACTOR_ID,
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
