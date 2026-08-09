import { describe, expect, it } from "vitest";

import {
  CanonicalTargetSchema,
  CanonicalUrlTargetSchema,
  TargetNormalizationResultSchema,
} from "./target-normalization.js";

const normalizationProfile = "d1-v1" as const;

describe("target normalization contracts", () => {
  it.each([
    {
      kind: "ip",
      normalizationProfile,
      family: 4,
      address: "192.0.2.7",
      zone: null,
    },
    {
      kind: "ip",
      normalizationProfile,
      family: 6,
      address: "2001:db8::1",
      zone: null,
    },
    {
      kind: "cidr",
      normalizationProfile,
      family: 4,
      network: "192.0.2.128",
      prefixLength: 25,
      hostBitsMasked: true,
    },
    {
      kind: "cidr",
      normalizationProfile,
      family: 6,
      network: "2001:db8:7::",
      prefixLength: 48,
      hostBitsMasked: true,
    },
    {
      kind: "hostname",
      normalizationProfile,
      hostname: "xn--bcher-kva.example",
    },
    {
      kind: "url",
      normalizationProfile,
      url: "https://[fe80::7%25Eth0]:8443/a?q=1",
      origin: "https://[fe80::7%25Eth0]:8443",
      host: { address: "fe80::7", zone: "Eth0" },
      effectivePort: 8443,
      pathAndQuery: "/a?q=1",
    },
  ])("accepts a canonical $kind target", (target) => {
    expect(CanonicalTargetSchema.safeParse(target).success).toBe(true);
  });

  it.each([
    {
      kind: "ip",
      normalizationProfile,
      family: 4,
      address: "2001:db8::1",
      zone: null,
    },
    {
      kind: "ip",
      normalizationProfile,
      family: 6,
      address: "192.0.2.7",
      zone: null,
    },
  ])("rejects a family-address structural mismatch", (target) => {
    expect(CanonicalTargetSchema.safeParse(target).success).toBe(false);
  });

  it.each([
    {
      kind: "ip",
      normalizationProfile,
      family: 4,
      address: "192.0.2.007",
      zone: null,
    },
    {
      kind: "ip",
      normalizationProfile,
      family: 6,
      address: "2001:0db8::1",
      zone: null,
    },
    { kind: "hostname", normalizationProfile, hostname: "Target.Example" },
    {
      kind: "cidr",
      normalizationProfile,
      family: 4,
      network: "192.0.2.129",
      prefixLength: 25,
      hostBitsMasked: false,
    },
    {
      kind: "cidr",
      normalizationProfile,
      family: 6,
      network: "2001:db8:7::1",
      prefixLength: 48,
      hostBitsMasked: false,
    },
    {
      kind: "ip",
      normalizationProfile,
      family: 6,
      address: "::ffff:c000:207",
      zone: null,
    },
    {
      kind: "ip",
      normalizationProfile,
      family: 6,
      address: "2001:db8::7",
      zone: "Eth0",
    },
    {
      kind: "url",
      normalizationProfile,
      url: "https://target.example/other",
      origin: "https://different.example:443",
      host: { hostname: "third.example" },
      effectivePort: 443,
      pathAndQuery: "/",
    },
  ])("leaves semantic canonicality to the domain", (target) => {
    expect(CanonicalTargetSchema.safeParse(target).success).toBe(true);
  });

  it("rejects missing profiles and unknown fields", () => {
    expect(
      CanonicalTargetSchema.safeParse({
        kind: "hostname",
        hostname: "target.example",
      }).success,
    ).toBe(false);

    expect(
      CanonicalTargetSchema.safeParse({
        kind: "hostname",
        normalizationProfile,
        hostname: "target.example",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it.each([0, 65_536, 1.5])("rejects invalid effective port %s", (port) => {
    expect(
      CanonicalUrlTargetSchema.safeParse({
        kind: "url",
        normalizationProfile,
        url: "https://target.example/",
        origin: "https://target.example",
        host: { hostname: "target.example" },
        effectivePort: port,
        pathAndQuery: "/",
      }).success,
    ).toBe(false);
  });

  it("enforces strict discriminated result shapes", () => {
    expect(
      TargetNormalizationResultSchema.safeParse({
        ok: true,
        target: {
          kind: "hostname",
          normalizationProfile,
          hostname: "target.example",
        },
      }).success,
    ).toBe(true);
    expect(
      TargetNormalizationResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_hostname" },
      }).success,
    ).toBe(true);

    expect(
      TargetNormalizationResultSchema.safeParse({
        ok: "false",
        error: { code: "invalid_hostname" },
      }).success,
    ).toBe(false);
    expect(
      TargetNormalizationResultSchema.safeParse({
        ok: false,
        error: { code: "not_a_real_code" },
      }).success,
    ).toBe(false);
    expect(
      TargetNormalizationResultSchema.safeParse({
        ok: false,
        error: { code: "invalid_hostname", detail: "untrusted input" },
      }).success,
    ).toBe(false);
  });
});
