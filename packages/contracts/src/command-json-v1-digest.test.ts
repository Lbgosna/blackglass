import { describe, expect, it } from "vitest";

import fixtureData from "../../../docs/architecture/fixtures/d2/canonical-request.json" with {
  type: "json",
};
import { CreateActionRequestSchema } from "./action-api.js";
import {
  CommandJsonV1CreateActionBodyDigestSchema,
  CommandJsonV1CreateEngagementBodyDigestSchema,
  commandJsonV1CreateActionDigest,
  commandJsonV1CreateEngagementDigest,
  projectCommandJsonV1DigestInput,
  projectCommandJsonV1DigestObject,
  projectCommandJsonV1SavedScopeRule,
} from "./command-json-v1-digest.js";
import { CreateEngagementInputSchema } from "./engagement.js";
import { canonicalizeJson } from "./operator-command.js";

const createEngagementFixture = (
  fixtureData as {
    cases: Array<{
      id: string;
      given: { value: { body: unknown } };
      expected: { canonicalJson: string };
    }>;
  }
).cases.find((fixtureCase) => fixtureCase.id === "d2.canonical.create-engagement");

const reservedIpRule = {
  id: "reserved-ip",
  kind: "ip" as const,
  target: {
    kind: "ip" as const,
    normalizationProfile: "d1-v1" as const,
    family: 4 as const,
    address: "192.0.2.20",
    zone: null,
  },
};

describe("command-json-v1 digest projection", () => {
  it("applies create-engagement defaults to the pinned D2 envelope", () => {
    if (createEngagementFixture === undefined) {
      throw new Error("Missing d2.canonical.create-engagement fixture.");
    }
    const omitted = {
      name: "Target lab",
      kind: "lab",
      autoContinueWarnings: false,
    };
    const explicitNull = {
      ...omitted,
      description: null,
      authorizationContext: null,
    };
    const projectedOmitted = projectCommandJsonV1DigestInput(
      commandJsonV1CreateEngagementDigest,
      { path: {}, query: {}, body: omitted },
    );
    const projectedExplicit = projectCommandJsonV1DigestInput(
      commandJsonV1CreateEngagementDigest,
      { path: {}, query: {}, body: explicitNull },
    );
    expect(projectedOmitted).toEqual(projectedExplicit);
    expect(projectedOmitted.body).toEqual(
      CreateEngagementInputSchema.parse(omitted),
    );
    expect(projectedOmitted.body).toEqual(createEngagementFixture.given.value.body);
    expect(
      canonicalizeJson({
        actorId: "local-operator-v1",
        body: projectedOmitted.body,
        canonicalizationProfile: "command-json-v1",
        operation: "create",
        path: projectedOmitted.path,
        query: projectedOmitted.query,
        route: "/api/v1/engagements",
      }),
    ).toEqual({
      ok: true,
      canonicalJson: createEngagementFixture.expected.canonicalJson,
    });
  });

  it("applies create-action declaredPorts default to schema output", () => {
    const omitted = {
      expectedEngagementRevision: 1,
      expectedActiveScopeRevisionId: null,
      targets: ["192.0.2.10"],
    };
    const explicitNull = { ...omitted, declaredPorts: null };
    expect(
      projectCommandJsonV1DigestObject(
        CommandJsonV1CreateActionBodyDigestSchema,
        omitted,
      ),
    ).toEqual(CreateActionRequestSchema.parse(omitted));
    expect(
      projectCommandJsonV1DigestObject(
        CommandJsonV1CreateActionBodyDigestSchema,
        omitted,
      ),
    ).toEqual(
      projectCommandJsonV1DigestObject(
        CommandJsonV1CreateActionBodyDigestSchema,
        explicitNull,
      ),
    );
    expect(
      projectCommandJsonV1DigestInput(commandJsonV1CreateActionDigest, {
        path: { engagementId: "10000000-0000-4000-8000-000000000001" },
        query: {},
        body: omitted,
      }).body,
    ).toEqual({ ...omitted, declaredPorts: null });
  });

  it("strips unknown top-level and nested fields without changing declared values", () => {
    const body = {
      name: "Target lab",
      kind: "lab",
      autoContinueWarnings: false,
    };
    expect(
      projectCommandJsonV1DigestObject(
        CommandJsonV1CreateEngagementBodyDigestSchema,
        { ...body, extra: true },
      ),
    ).toEqual(CreateEngagementInputSchema.parse(body));
    expect(
      commandJsonV1CreateEngagementDigest.projectQuery({ ignored: "true" }),
    ).toEqual({});

    const ruleWithUnknowns = {
      ...reservedIpRule,
      extra: true,
      target: { ...reservedIpRule.target, extra: true },
      portRanges: [{ from: 80, to: 80, extra: true }],
    };
    expect(projectCommandJsonV1SavedScopeRule(ruleWithUnknowns)).toEqual({
      ...reservedIpRule,
      portRanges: [{ from: 80, to: 80 }],
    });

    const urlOrigin = {
      id: "origin-1",
      kind: "url-origin" as const,
      origin: {
        scheme: "https",
        host: { hostname: "app.target.test" },
        effectivePort: 443,
        extra: true,
      },
      extra: true,
    };
    expect(projectCommandJsonV1SavedScopeRule(urlOrigin)).toEqual({
      id: "origin-1",
      kind: "url-origin",
      origin: {
        scheme: "https",
        host: { hostname: "app.target.test" },
        effectivePort: 443,
      },
    });
  });

  it("keeps invalid declared spellings distinct from schema output", () => {
    expect(
      projectCommandJsonV1DigestObject(
        CommandJsonV1CreateEngagementBodyDigestSchema,
        {
          name: "Target lab",
          kind: "lab",
          autoContinueWarnings: "false",
          extra: true,
        },
      ),
    ).toEqual({
      name: "Target lab",
      kind: "lab",
      description: null,
      authorizationContext: null,
      autoContinueWarnings: "false",
    });
    expect(
      projectCommandJsonV1SavedScopeRule({
        ...reservedIpRule,
        extra: true,
        target: { ...reservedIpRule.target, extra: true, address: 20 },
      }),
    ).toEqual({
      ...reservedIpRule,
      target: { ...reservedIpRule.target, address: 20 },
    });
    expect(
      projectCommandJsonV1SavedScopeRule({
        id: "origin-1",
        kind: "url-origin",
        origin: {
          scheme: "https",
          host: { hostname: "app.target.test", address: "192.0.2.10" },
          effectivePort: 443,
        },
      }),
    ).not.toEqual({
      id: "origin-1",
      kind: "url-origin",
      origin: {
        scheme: "https",
        host: { hostname: "app.target.test" },
        effectivePort: 443,
      },
    });
  });
});
