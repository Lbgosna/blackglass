import { describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d1/snapshot-canonicalization.json" with {
  type: "json",
};
import {
  ACTION_SNAPSHOT_CANONICALIZATION_PROFILE,
  ACTION_SNAPSHOT_HASH_FIELDS,
  ActionSnapshotDigestSchema,
  canonicalizeActionSnapshot,
} from "./action-snapshot.js";

interface SnapshotCanonicalFixtureCase {
  id: string;
  given: {
    value?: Record<string, unknown>;
    left?: Record<string, unknown>;
    right?: Record<string, unknown>;
  };
  expected: {
    canonicalJson: string;
    digest: string;
    sameDigest?: boolean;
  };
}

const fixture = fixtureData as { cases: SnapshotCanonicalFixtureCase[] };

describe("action snapshot canonicalization", () => {
  it("executes every accepted D1 snapshot canonicalization fixture", () => {
    for (const fixtureCase of fixture.cases) {
      const subjects =
        fixtureCase.given.value === undefined
          ? [fixtureCase.given.left, fixtureCase.given.right]
          : [fixtureCase.given.value];
      const results = subjects.map((subject) => canonicalizeActionSnapshot(subject));
      for (const result of results) {
        expect(result, fixtureCase.id).toEqual({
          ok: true,
          canonicalJson: fixtureCase.expected.canonicalJson,
        });
      }
      expect(ActionSnapshotDigestSchema.safeParse(fixtureCase.expected.digest).success).toBe(
        true,
      );
      if (fixtureCase.expected.sameDigest === true) {
        expect(results[0]).toEqual(results[1]);
      }
    }
  });

  it("binds exactly the six accepted immutable snapshot fields", () => {
    expect(ACTION_SNAPSHOT_CANONICALIZATION_PROFILE).toBe("action-snapshot-json-v1");
    expect([...ACTION_SNAPSHOT_HASH_FIELDS]).toEqual([
      "actionId",
      "canonicalTargets",
      "typedOptions",
      "resolutionSnapshots",
      "scopeRevisionId",
      "warningState",
    ]);
  });

  it("preserves explicit null and rejects omitted scope or acknowledgment", () => {
    const base = fixture.cases[0]?.given.value;
    expect(base).toBeDefined();
    const withoutScope = { ...base };
    delete withoutScope.scopeRevisionId;
    expect(canonicalizeActionSnapshot(withoutScope)).toEqual({
      ok: false,
      error: { code: "canonical_value_unsupported" },
    });
    expect(
      canonicalizeActionSnapshot({
        ...base,
        warningState: { reasonCodes: [], knownAdditions: [] },
      }),
    ).toEqual({
      ok: false,
      error: { code: "canonical_value_unsupported" },
    });
  });

  it("does not normalize Unicode or negative zero in typed options", () => {
    const base = {
      actionId: "action-snapshot-unicode",
      canonicalTargets: [
        {
          normalizationProfile: "d1-v1",
          kind: "hostname",
          hostname: "app.target.test",
        },
      ],
      typedOptions: { label: "é", values: [-0, 0] },
      resolutionSnapshots: [],
      scopeRevisionId: null,
      warningState: {
        reasonCodes: [],
        knownAdditions: [],
        acknowledgment: null,
      },
    };
    expect(canonicalizeActionSnapshot(base)).toEqual({
      ok: true,
      canonicalJson:
        '{"actionId":"action-snapshot-unicode","canonicalTargets":[{"hostname":"app.target.test","kind":"hostname","normalizationProfile":"d1-v1"}],"canonicalizationProfile":"action-snapshot-json-v1","resolutionSnapshots":[],"scopeRevisionId":null,"typedOptions":{"label":"é","values":[0,0]},"warningState":{"acknowledgment":null,"knownAdditions":[],"reasonCodes":[]}}',
    });
    expect(
      canonicalizeActionSnapshot({
        ...base,
        typedOptions: { label: "e\u0301", values: [0, 0] },
      }),
    ).not.toEqual(canonicalizeActionSnapshot(base));
  });

  it("rejects unsupported snapshot values without reflection", () => {
    const marker = "SENSITIVE_UNTRUSTED_MARKER";
    const result = canonicalizeActionSnapshot({
      actionId: "action-snapshot-invalid",
      canonicalTargets: [
        {
          normalizationProfile: "d1-v1",
          kind: "hostname",
          hostname: "app.target.test",
        },
      ],
      typedOptions: { callback: () => marker },
      resolutionSnapshots: [],
      scopeRevisionId: null,
      warningState: {
        reasonCodes: [],
        knownAdditions: [],
        acknowledgment: null,
      },
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "canonical_value_unsupported" },
    });
    expect(JSON.stringify(result)).not.toContain(marker);
  });
});
