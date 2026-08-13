import { describe, expect, it } from "vitest";

import {
  AppendScopeRevisionInputSchema,
  CreateEngagementInputSchema,
  EngagementSchema,
  EngagementWithActiveScopeSchema,
  ScopeRevisionSchema,
} from "./engagement.js";

const engagement = {
  contractVersion: 1,
  id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  name: "Target lab",
  kind: "lab",
  status: "active",
  description: null,
  authorizationContext: "Synthetic fixture authorization context",
  autoContinueWarnings: false,
  activeScopeRevisionId: null,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: "2026-08-12T12:00:00.000Z",
} as const;

const scopeRevision = {
  contractVersion: 1,
  id: "20000000-0000-4000-8000-000000000001",
  engagementId: engagement.id,
  version: 1,
  rules: [],
  createdAt: "2026-08-12T12:01:00.000Z",
} as const;

describe("engagement contracts", () => {
  it("accepts strict versioned engagement and scope records", () => {
    expect(EngagementSchema.safeParse(engagement).success).toBe(true);
    expect(ScopeRevisionSchema.safeParse(scopeRevision).success).toBe(true);
    expect(
      EngagementWithActiveScopeSchema.safeParse({
        engagement: { ...engagement, activeScopeRevisionId: scopeRevision.id },
        activeScopeRevision: scopeRevision,
      }).success,
    ).toBe(true);
  });

  it("keeps no active scope distinct from an active empty revision", () => {
    expect(
      EngagementWithActiveScopeSchema.safeParse({
        engagement,
        activeScopeRevision: null,
      }).success,
    ).toBe(true);
    expect(
      ScopeRevisionSchema.safeParse({ ...scopeRevision, rules: [] }).success,
    ).toBe(true);
  });

  it("rejects padded, empty, oversized, or unknown input without rewriting it", () => {
    expect(
      CreateEngagementInputSchema.safeParse({
        name: "  Target lab  ",
        kind: "lab",
        description: null,
        authorizationContext: null,
        autoContinueWarnings: false,
      }).success,
    ).toBe(false);
    expect(
      CreateEngagementInputSchema.safeParse({
        name: "   ",
        kind: "lab",
        description: null,
        authorizationContext: null,
        autoContinueWarnings: false,
      }).success,
    ).toBe(false);
    expect(
      CreateEngagementInputSchema.safeParse({
        name: "😀".repeat(120),
        kind: "lab",
        description: "😀".repeat(4_096),
        authorizationContext: null,
        autoContinueWarnings: false,
      }).success,
    ).toBe(true);
    expect(
      CreateEngagementInputSchema.safeParse({
        name: "😀".repeat(121),
        kind: "lab",
        description: null,
        authorizationContext: null,
        autoContinueWarnings: false,
      }).success,
    ).toBe(false);
    expect(
      CreateEngagementInputSchema.safeParse({
        name: "Target lab",
        kind: "lab",
        description: "x".repeat(4_097),
        authorizationContext: null,
        autoContinueWarnings: false,
      }).success,
    ).toBe(false);
    expect(
      EngagementSchema.safeParse({ ...engagement, untrusted: true }).success,
    ).toBe(false);
  });

  it("rejects non-UTC timestamps and unknown scope fields", () => {
    expect(
      EngagementSchema.safeParse({
        ...engagement,
        createdAt: "2026-08-12T14:00:00.000+02:00",
      }).success,
    ).toBe(false);
    expect(
      AppendScopeRevisionInputSchema.safeParse({
        engagementId: engagement.id,
        expectedRevision: 1,
        rules: [
          {
            id: "rule-fixture-1",
            kind: "ip",
            target: {
              normalizationProfile: "d1-v1",
              kind: "ip",
              family: 4,
              address: "192.0.2.7",
              zone: null,
            },
            unknown: true,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
