import { describe, expect, it } from "vitest";

import {
  ConcreteTargetCardinalityInputSchema,
  DeclaredPortsSchema,
  ExecutionCapabilityResultSchema,
  PortRangeNormalizationResultSchema,
  SavedScopeComparisonInputSchema,
  SavedScopeComparisonResultSchema,
  SavedScopeRuleSchema,
  SaturatedCardinalitySchema,
  ScopeComparisonSubjectSchema,
  ScopePortRangeSchema,
} from "./saved-scope.js";

const ipTarget = {
  normalizationProfile: "d1-v1",
  kind: "ip",
  family: 4,
  address: "192.0.2.7",
  zone: null,
} as const;

const hostnameTarget = {
  normalizationProfile: "d1-v1",
  kind: "hostname",
  hostname: "target.test",
} as const;

const ipRule = {
  id: "rule-ip",
  kind: "ip",
  target: ipTarget,
} as const;

const subject = {
  target: ipTarget,
  declaredPorts: null,
  provenance: { kind: "direct" },
} as const;

describe("saved-scope contracts", () => {
  it("accepts the four strict canonical rule kinds", () => {
    const rules = [
      ipRule,
      {
        id: "rule-cidr",
        kind: "cidr",
        target: {
          normalizationProfile: "d1-v1",
          kind: "cidr",
          family: 4,
          network: "192.0.2.0",
          prefixLength: 24,
          hostBitsMasked: false,
        },
      },
      {
        id: "rule-domain",
        kind: "domain",
        target: hostnameTarget,
        includeSubdomains: true,
        portRanges: [{ from: 80, to: 443 }],
      },
      {
        id: "rule-origin",
        kind: "url-origin",
        origin: {
          scheme: "https",
          host: { hostname: "target.test" },
          effectivePort: 443,
        },
      },
    ];

    for (const rule of rules) {
      expect(SavedScopeRuleSchema.safeParse(rule).success).toBe(true);
    }
  });

  it.each([
    [ScopePortRangeSchema, { from: 1, to: 1, extra: true }],
    [SavedScopeRuleSchema, { ...ipRule, extra: true }],
    [ScopeComparisonSubjectSchema, { ...subject, extra: true }],
    [
      SavedScopeComparisonInputSchema,
      {
        currentActionId: "action-current",
        scopeRevisionId: "scope-current",
        rules: [ipRule],
        subjects: [subject],
        extra: true,
      },
    ],
  ])("rejects unknown fields", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("rejects malformed discriminants and nested canonical targets", () => {
    expect(
      SavedScopeRuleSchema.safeParse({ ...ipRule, kind: "network" }).success,
    ).toBe(false);
    expect(
      SavedScopeRuleSchema.safeParse({
        ...ipRule,
        target: { ...ipTarget, address: "operator-secret" },
      }).success,
    ).toBe(false);
    expect(
      ScopeComparisonSubjectSchema.safeParse({
        ...subject,
        target: { ...ipTarget, family: 6 },
      }).success,
    ).toBe(false);
    expect(
      ScopeComparisonSubjectSchema.safeParse({
        target: {
          normalizationProfile: "d1-v1",
          kind: "url",
          url: "https://target.test/",
          origin: "https://target.test:443",
          host: { hostname: "target.test" },
          effectivePort: 443,
          pathAndQuery: "/",
        },
        declaredPorts: null,
        provenance: {
          kind: "redirect",
          actionId: "action-current",
          sourceOrigin: {
            scheme: "https",
            host: { hostname: "source.test" },
            effectivePort: 443,
          },
          sourceResolvedAddress: ipTarget,
          destinationResolvedAddress: ipTarget,
        },
      }).success,
    ).toBe(true);
    expect(
      ScopeComparisonSubjectSchema.safeParse({
        target: hostnameTarget,
        declaredPorts: null,
        provenance: {
          kind: "hostname_resolution",
          actionId: "action-current",
          sourceHostname: hostnameTarget,
        },
      }).success,
    ).toBe(false);
  });

  it("requires declared ports to be present, sorted, unique, and bounded", () => {
    expect(DeclaredPortsSchema.safeParse(null).success).toBe(true);
    expect(DeclaredPortsSchema.safeParse([1, 443, 65_535]).success).toBe(true);
    expect(DeclaredPortsSchema.safeParse([]).success).toBe(false);
    expect(DeclaredPortsSchema.safeParse([443, 80]).success).toBe(false);
    expect(DeclaredPortsSchema.safeParse([80, 80]).success).toBe(false);
    expect(DeclaredPortsSchema.safeParse([0]).success).toBe(false);
    expect(DeclaredPortsSchema.safeParse([65_536]).success).toBe(false);
  });

  it("rejects null revisions with rules, duplicate IDs, and stale provenance", () => {
    const base = {
      currentActionId: "action-current",
      scopeRevisionId: "scope-current",
      rules: [ipRule],
      subjects: [subject],
    };
    expect(SavedScopeComparisonInputSchema.safeParse(base).success).toBe(true);
    expect(
      SavedScopeComparisonInputSchema.safeParse({
        ...base,
        scopeRevisionId: null,
      }).success,
    ).toBe(false);
    expect(
      SavedScopeComparisonInputSchema.safeParse({
        ...base,
        rules: [ipRule, ipRule],
      }).success,
    ).toBe(false);
    expect(
      SavedScopeComparisonInputSchema.safeParse({
        ...base,
        subjects: [
          {
            ...subject,
            provenance: {
              kind: "hostname_resolution",
              actionId: "action-prior",
              sourceHostname: hostnameTarget,
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps result and cardinality contracts bounded and strict", () => {
    expect(
      PortRangeNormalizationResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_port_range", port: 0, minimumPort: 1 },
      }).success,
    ).toBe(true);
    expect(
      SaturatedCardinalitySchema.safeParse({
        estimatedConcreteTargets: 4_098,
        countSaturated: true,
        largeTargetWarning: true,
      }).success,
    ).toBe(false);
    expect(
      ExecutionCapabilityResultSchema.safeParse({
        ok: false,
        error: { code: "capability_error", detail: "operator-secret" },
      }).success,
    ).toBe(false);
    expect(
      SavedScopeComparisonResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_scope_input", stack: "operator-secret" },
      }).success,
    ).toBe(false);
  });

  it("limits cardinality inputs to canonical concrete IP and CIDR targets", () => {
    expect(
      ConcreteTargetCardinalityInputSchema.safeParse({ targets: [ipTarget] })
        .success,
    ).toBe(true);
    expect(
      ConcreteTargetCardinalityInputSchema.safeParse({
        targets: [hostnameTarget],
      }).success,
    ).toBe(false);
  });
});
