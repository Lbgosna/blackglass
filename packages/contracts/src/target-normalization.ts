import { z } from "zod";

export const TARGET_NORMALIZATION_PROFILE = "d1-v1" as const;

export const NormalizationProfileSchema = z.literal(
  TARGET_NORMALIZATION_PROFILE,
);

export const CanonicalIpv4AddressSchema = z
  .string()
  .regex(/^(?:\d{1,3}\.){3}\d{1,3}$/);

export const CanonicalIpv6AddressSchema = z
  .string()
  .min(2)
  .max(39)
  .regex(/^(?=.*:)[0-9A-Fa-f:]+$/);

export const CanonicalHostnameSchema = z.string().min(1);

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
});

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
});

export const CanonicalIpv6CidrTargetSchema = z.strictObject({
  kind: z.literal("cidr"),
  normalizationProfile: NormalizationProfileSchema,
  family: z.literal(6),
  network: CanonicalIpv6AddressSchema,
  prefixLength: z.number().int().min(0).max(128),
  hostBitsMasked: z.boolean(),
});

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
});

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
});

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
