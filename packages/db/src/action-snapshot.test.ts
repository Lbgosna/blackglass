import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d1/snapshot-canonicalization.json" with {
  type: "json",
};
import { bindActionSnapshot } from "./action-snapshot.js";

interface SnapshotCanonicalFixtureCase {
  id: string;
  given: {
    value?: unknown;
    left?: unknown;
    right?: unknown;
  };
  expected: {
    canonicalJson: string;
    digest: string;
    sameDigest?: boolean;
  };
}

const fixture = fixtureData as { cases: SnapshotCanonicalFixtureCase[] };

describe("action snapshot digest binding", () => {
  it("executes every accepted D1 snapshot digest vector", () => {
    for (const fixtureCase of fixture.cases) {
      const subjects =
        fixtureCase.given.value === undefined
          ? [fixtureCase.given.left, fixtureCase.given.right]
          : [fixtureCase.given.value];
      const results = subjects.map((subject) => bindActionSnapshot(subject));
      for (const result of results) {
        expect(result, fixtureCase.id).toEqual({
          ok: true,
          binding: fixtureCase.expected.digest,
          canonicalJson: fixtureCase.expected.canonicalJson,
        });
        if (!result.ok) continue;
        expect(
          `sha256:${createHash("sha256").update(result.canonicalJson, "utf8").digest("hex")}`,
        ).toBe(fixtureCase.expected.digest);
      }
      if (fixtureCase.expected.sameDigest === true) {
        expect(results[0]).toEqual(results[1]);
      }
    }
  });

  it("rejects unsupported snapshot input without reflection", () => {
    const marker = "SENSITIVE_UNTRUSTED_MARKER";
    const result = bindActionSnapshot({ actionId: marker });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_repository_input" },
    });
    expect(JSON.stringify(result)).not.toContain(marker);
  });
});
