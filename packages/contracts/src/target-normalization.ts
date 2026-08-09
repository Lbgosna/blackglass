import { z } from "zod";

export const TARGET_NORMALIZATION_PROFILE = "d1-v1" as const;

export const NormalizationProfileSchema = z.literal(
  TARGET_NORMALIZATION_PROFILE,
);

const IPV4_COMPONENT_PATTERN = /^(?:0|[1-9]\d{0,2})$/;

function isCanonicalIpv4(value: string): boolean {
  const components = value.split(".");

  return (
    components.length === 4 &&
    components.every(
      (component) =>
        IPV4_COMPONENT_PATTERN.test(component) && Number(component) <= 255,
    )
  );
}

function parseIpv6Words(value: string): number[] | null {
  if (
    value.length === 0 ||
    value !== value.toLowerCase() ||
    value.includes(".") ||
    value.includes("%") ||
    !/^[0-9a-f:]+$/.test(value) ||
    value.includes(":::")
  ) {
    return null;
  }

  const compressionParts = value.split("::");
  if (compressionParts.length > 2) {
    return null;
  }

  const parseSide = (side: string): number[] | null => {
    if (side.length === 0) {
      return [];
    }

    const groups = side.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
      return null;
    }

    return groups.map((group) => Number.parseInt(group, 16));
  };

  const left = parseSide(compressionParts[0] ?? "");
  const right = parseSide(compressionParts[1] ?? "");
  if (left === null || right === null) {
    return null;
  }

  if (compressionParts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omittedCount = 8 - left.length - right.length;
  if (omittedCount < 1) {
    return null;
  }

  return [...left, ...Array<number>(omittedCount).fill(0), ...right];
}

function serializeIpv6Words(words: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;

  for (let index = 0; index < words.length; ) {
    if (words[index] !== 0) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < words.length && words[index] === 0) {
      index += 1;
    }

    const length = index - start;
    if (length >= 2 && length > bestLength) {
      bestStart = start;
      bestLength = length;
    }
  }

  if (bestStart === -1) {
    return words.map((word) => word.toString(16)).join(":");
  }

  const left = words
    .slice(0, bestStart)
    .map((word) => word.toString(16))
    .join(":");
  const right = words
    .slice(bestStart + bestLength)
    .map((word) => word.toString(16))
    .join(":");

  return `${left}::${right}`;
}

function isCanonicalIpv6(value: string): boolean {
  const words = parseIpv6Words(value);
  return (
    words !== null &&
    serializeIpv6Words(words) === value &&
    !(words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)
  );
}

function isCanonicalIpv4Network(
  network: string,
  prefixLength: number,
): boolean {
  const components = network.split(".").map(Number);
  const addressNumber =
    (((components[0] ?? 0) << 24) >>> 0) +
    ((components[1] ?? 0) << 16) +
    ((components[2] ?? 0) << 8) +
    (components[3] ?? 0);
  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;

  return ((addressNumber & mask) >>> 0) === addressNumber;
}

function isCanonicalIpv6Network(
  network: string,
  prefixLength: number,
): boolean {
  const words = parseIpv6Words(network);
  if (words === null) {
    return false;
  }

  let remainingPrefixBits = prefixLength;
  return words.every((word) => {
    const wordPrefixBits = Math.min(16, remainingPrefixBits);
    remainingPrefixBits -= wordPrefixBits;
    const mask =
      wordPrefixBits === 0 ? 0 : (0xffff << (16 - wordPrefixBits)) & 0xffff;
    return (word & mask) === word;
  });
}

function isLinkLocalIpv6(value: string): boolean {
  const words = parseIpv6Words(value);
  return words !== null && ((words[0] ?? 0) & 0xffc0) === 0xfe80;
}

function isCanonicalHostname(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 253 ||
    value !== value.toLowerCase() ||
    !/^[a-z0-9.-]+$/.test(value)
  ) {
    return false;
  }

  return value.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
  );
}

export const CanonicalIpv4AddressSchema = z
  .string()
  .refine(isCanonicalIpv4, "Expected a canonical IPv4 address");

export const CanonicalIpv6AddressSchema = z
  .string()
  .refine(isCanonicalIpv6, "Expected an RFC 5952 IPv6 address");

export const CanonicalHostnameSchema = z
  .string()
  .refine(isCanonicalHostname, "Expected a canonical ASCII hostname");

export const Ipv6ZoneSchema = z
  .string()
  .min(1)
  .max(15)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const CanonicalIpv4TargetSchema = z.strictObject({
  kind: z.literal("ip"),
  normalizationProfile: NormalizationProfileSchema,
  family: z.literal(4),
  address: CanonicalIpv4AddressSchema,
  zone: z.null(),
});

export const CanonicalIpv6TargetSchema = z.strictObject({
  kind: z.literal("ip"),
  normalizationProfile: NormalizationProfileSchema,
  family: z.literal(6),
  address: CanonicalIpv6AddressSchema,
  zone: Ipv6ZoneSchema.nullable(),
}).refine(
  ({ address, zone }) => zone === null || isLinkLocalIpv6(address),
  "Expected a zone only on an IPv6 link-local address",
);

export const CanonicalIpTargetSchema = z.discriminatedUnion("family", [
  CanonicalIpv4TargetSchema,
  CanonicalIpv6TargetSchema,
]);

export const CanonicalIpv4CidrTargetSchema = z.strictObject({
  kind: z.literal("cidr"),
  normalizationProfile: NormalizationProfileSchema,
  family: z.literal(4),
  network: CanonicalIpv4AddressSchema,
  prefixLength: z.number().int().min(0).max(32),
  hostBitsMasked: z.boolean(),
}).refine(
  ({ network, prefixLength }) =>
    isCanonicalIpv4Network(network, prefixLength),
  "Expected an IPv4 network address with host bits cleared",
);

export const CanonicalIpv6CidrTargetSchema = z.strictObject({
  kind: z.literal("cidr"),
  normalizationProfile: NormalizationProfileSchema,
  family: z.literal(6),
  network: CanonicalIpv6AddressSchema,
  prefixLength: z.number().int().min(0).max(128),
  hostBitsMasked: z.boolean(),
}).refine(
  ({ network, prefixLength }) =>
    isCanonicalIpv6Network(network, prefixLength),
  "Expected an IPv6 network address with host bits cleared",
);

export const CanonicalCidrTargetSchema = z.discriminatedUnion("family", [
  CanonicalIpv4CidrTargetSchema,
  CanonicalIpv6CidrTargetSchema,
]);

export const CanonicalHostnameTargetSchema = z.strictObject({
  kind: z.literal("hostname"),
  normalizationProfile: NormalizationProfileSchema,
  hostname: CanonicalHostnameSchema,
});

export const CanonicalUrlHostnameHostSchema = z.strictObject({
  hostname: CanonicalHostnameSchema,
});

export const CanonicalUrlIpv4HostSchema = z.strictObject({
  address: CanonicalIpv4AddressSchema,
  zone: z.null(),
});

export const CanonicalUrlIpv6HostSchema = z.strictObject({
  address: CanonicalIpv6AddressSchema,
  zone: Ipv6ZoneSchema.nullable(),
}).refine(
  ({ address, zone }) => zone === null || isLinkLocalIpv6(address),
  "Expected a zone only on an IPv6 link-local address",
);

export const CanonicalUrlHostSchema = z.union([
  CanonicalUrlHostnameHostSchema,
  CanonicalUrlIpv4HostSchema,
  CanonicalUrlIpv6HostSchema,
]);

export const CanonicalUrlTargetSchema = z.strictObject({
  kind: z.literal("url"),
  normalizationProfile: NormalizationProfileSchema,
  url: z.string().regex(/^https?:\/\/[^#]+$/),
  origin: z.string().regex(/^https?:\/\/[^/?#]+$/),
  host: CanonicalUrlHostSchema,
  effectivePort: z.number().int().min(1).max(65_535),
  pathAndQuery: z.string().regex(/^\/[^#]*$/),
}).refine(({ url, origin, host, effectivePort, pathAndQuery }) => {
  const scheme = url.startsWith("http://") ? "http" : "https";
  const defaultPort = scheme === "http" ? 80 : 443;
  const hostText =
    "hostname" in host
      ? host.hostname
      : host.address.includes(":")
        ? `[${host.address}${host.zone === null ? "" : `%25${host.zone}`}]`
        : host.address;
  const serializedPort = effectivePort === defaultPort ? "" : `:${effectivePort}`;

  return (
    origin === `${scheme}://${hostText}:${effectivePort}` &&
    url === `${scheme}://${hostText}${serializedPort}${pathAndQuery}`
  );
}, "Expected internally consistent canonical URL fields");

export const CanonicalTargetSchema = z.union([
  CanonicalIpTargetSchema,
  CanonicalCidrTargetSchema,
  CanonicalHostnameTargetSchema,
  CanonicalUrlTargetSchema,
]);

export const TargetNormalizationErrorCodeSchema = z.enum([
  "ambiguous_numeric_host",
  "control_byte",
  "empty_target",
  "hostname_label_too_long",
  "hostname_too_long",
  "invalid_cidr",
  "invalid_hostname",
  "invalid_hostname_label",
  "invalid_ipv4",
  "invalid_ipv6",
  "invalid_url",
  "invalid_zone",
  "invalid_zone_encoding",
  "mapped_ipv6_cidr_unsupported",
  "target_too_long",
  "unsupported_url_scheme",
  "url_fragment_unsupported",
  "url_userinfo_unsupported",
  "wildcard_unsupported",
  "zone_requires_link_local",
]);

export const TargetNormalizationErrorSchema = z.strictObject({
  code: TargetNormalizationErrorCodeSchema,
});

export const TargetNormalizationSuccessSchema = z.strictObject({
  ok: z.literal(true),
  target: CanonicalTargetSchema,
});

export const TargetNormalizationFailureSchema = z.strictObject({
  ok: z.literal(false),
  error: TargetNormalizationErrorSchema,
});

export const TargetNormalizationResultSchema = z.discriminatedUnion("ok", [
  TargetNormalizationSuccessSchema,
  TargetNormalizationFailureSchema,
]);

export type NormalizationProfile = z.infer<typeof NormalizationProfileSchema>;
export type CanonicalIpv4Target = z.infer<typeof CanonicalIpv4TargetSchema>;
export type CanonicalIpv6Target = z.infer<typeof CanonicalIpv6TargetSchema>;
export type CanonicalIpTarget = z.infer<typeof CanonicalIpTargetSchema>;
export type CanonicalCidrTarget = z.infer<typeof CanonicalCidrTargetSchema>;
export type CanonicalHostnameTarget = z.infer<
  typeof CanonicalHostnameTargetSchema
>;
export type CanonicalUrlHost = z.infer<typeof CanonicalUrlHostSchema>;
export type CanonicalUrlTarget = z.infer<typeof CanonicalUrlTargetSchema>;
export type CanonicalTarget = z.infer<typeof CanonicalTargetSchema>;
export type TargetNormalizationErrorCode = z.infer<
  typeof TargetNormalizationErrorCodeSchema
>;
export type TargetNormalizationError = z.infer<
  typeof TargetNormalizationErrorSchema
>;
export type TargetNormalizationSuccess = z.infer<
  typeof TargetNormalizationSuccessSchema
>;
export type TargetNormalizationFailure = z.infer<
  typeof TargetNormalizationFailureSchema
>;
export type TargetNormalizationResult = z.infer<
  typeof TargetNormalizationResultSchema
>;
