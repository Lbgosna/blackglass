import { describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d2/canonical-request.json" with {
  type: "json",
};
import {
  CommandRequestDigestSchema,
  IdempotencyKeySchema,
  MAX_CANONICAL_JSON_BYTES,
  MAX_CANONICAL_JSON_DEPTH,
  canonicalizeJson,
} from "./operator-command.js";

interface CanonicalFixtureCase {
  id: string;
  given: { value: unknown };
  expected: { canonicalJson: string; digest: string };
}

const fixture = fixtureData as { cases: CanonicalFixtureCase[] };

describe("operator command canonicalization", () => {
  it("executes every accepted D2 canonical request fixture directly", () => {
    for (const fixtureCase of fixture.cases) {
      const result = canonicalizeJson(fixtureCase.given.value);
      expect(result, fixtureCase.id).toEqual({
        ok: true,
        canonicalJson: fixtureCase.expected.canonicalJson,
      });
      if (!result.ok) continue;
      expect(CommandRequestDigestSchema.safeParse(fixtureCase.expected.digest).success).toBe(
        true,
      );
    }
  });

  it("erases object insertion order but preserves array order and explicit null", () => {
    expect(canonicalizeJson({ b: null, a: [1, 2] })).toEqual(
      canonicalizeJson({ a: [1, 2], b: null }),
    );
    expect(canonicalizeJson({ a: [1, 2], b: null })).not.toEqual(
      canonicalizeJson({ a: [2, 1] }),
    );
    expect(canonicalizeJson({ a: null })).not.toEqual(canonicalizeJson({}));
  });

  it("does not normalize Unicode or negative zero", () => {
    expect(canonicalizeJson("é")).not.toEqual(canonicalizeJson("e\u0301"));
    expect(canonicalizeJson([-0, 0])).toEqual({
      ok: true,
      canonicalJson: "[0,0]",
    });
  });

  it.each([
    undefined,
    1n,
    Symbol("unsupported"),
    () => undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    new Date("2026-08-12T12:00:00.000Z"),
    "\ud800",
    { "\udc00": true },
  ])("rejects unsupported value %s without reflection", (value) => {
    expect(canonicalizeJson(value)).toEqual({
      ok: false,
      error: { code: "canonical_value_unsupported" },
    });
  });

  it("rejects sparse or decorated arrays, accessors, symbol keys, and cycles", () => {
    const sparse = new Array(1);
    const decorated = ["visible"] as string[] & { extra?: string };
    decorated.extra = "hidden";
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "secret",
    });
    const symbolKey = { value: true, [Symbol("hidden")]: true };
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    for (const value of [sparse, decorated, accessor, symbolKey, cyclic]) {
      expect(canonicalizeJson(value)).toEqual({
        ok: false,
        error: { code: "canonical_value_unsupported" },
      });
    }
  });

  it("fails closed when adversarial reflection traps throw", () => {
    const value = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("SENSITIVE_PROXY_MARKER");
        },
      },
    );
    const result = canonicalizeJson(value);
    expect(result).toEqual({
      ok: false,
      error: { code: "canonical_value_unsupported" },
    });
    expect(JSON.stringify(result)).not.toContain("SENSITIVE_PROXY_MARKER");
  });

  it("serializes one descriptor snapshot without invoking value getters", () => {
    let reads = 0;
    const value = new Proxy(
      {},
      {
        getPrototypeOf: () => Object.prototype,
        ownKeys: () => ["value"],
        getOwnPropertyDescriptor: () => ({
          configurable: true,
          enumerable: true,
          value: "snapshot",
        }),
        get: () => {
          reads += 1;
          return "changed";
        },
      },
    );
    expect(canonicalizeJson(value)).toEqual({
      ok: true,
      canonicalJson: '{"value":"snapshot"}',
    });
    expect(reads).toBe(0);
  });

  it("pins depth and UTF-8 byte limits", () => {
    let atLimit: unknown = null;
    for (let index = 0; index < MAX_CANONICAL_JSON_DEPTH; index += 1) {
      atLimit = [atLimit];
    }
    expect(canonicalizeJson(atLimit).ok).toBe(true);
    expect(canonicalizeJson([atLimit])).toEqual({
      ok: false,
      error: { code: "canonical_depth_exceeded" },
    });
    expect(canonicalizeJson("x".repeat(MAX_CANONICAL_JSON_BYTES - 2)).ok).toBe(true);
    expect(canonicalizeJson("😀".repeat(MAX_CANONICAL_JSON_BYTES / 4))).toEqual({
      ok: false,
      error: { code: "canonical_size_exceeded" },
    });
  });

  it("accepts only the D2 idempotency key boundary", () => {
    expect(IdempotencyKeySchema.safeParse("a".repeat(22)).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("~".repeat(128)).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("a".repeat(21)).success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("a".repeat(129)).success).toBe(false);
    expect(IdempotencyKeySchema.safeParse(`a${"b".repeat(21)}\n`).success).toBe(false);
  });
});
