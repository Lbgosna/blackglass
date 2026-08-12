import { z } from "zod";

import {
  CanonicalCidrTargetSchema,
  CanonicalHostnameTargetSchema,
  CanonicalIpTargetSchema,
  CanonicalTargetSchema,
  CanonicalUrlHostSchema,
} from "./target-normalization.js";

const IdentifierSchema = z.string().min(1).max(255);
const PortSchema = z.number().int().min(1).max(65_535);

export const ScopePortRangeInputSchema = z.strictObject({
  from: z.number().finite(),
  to: z.number().finite(),
});

export const ScopePortRangeSchema = z
  .strictObject({ from: PortSchema, to: PortSchema })
  .refine(({ from, to }) => from <= to, { message: "inverted range" });

export const DeclaredPortsSchema = z
  .array(PortSchema)
  .min(1)
  .superRefine((ports, context) => {
    for (let index = 1; index < ports.length; index += 1) {
      if ((ports[index - 1] as number) >= (ports[index] as number)) {
        context.addIssue({
          code: "custom",
          message: "declared ports must be sorted and unique",
        });
        return;
      }
    }
  })
  .nullable();

const PortRestrictionsSchema = z.array(ScopePortRangeSchema).min(1).optional();

export const CanonicalUrlOriginSchema = z.strictObject({
  scheme: z.enum(["http", "https"]),
  host: CanonicalUrlHostSchema,
  effectivePort: PortSchema,
});

export const ExactIpScopeRuleSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.literal("ip"),
  target: CanonicalIpTargetSchema,
  portRanges: PortRestrictionsSchema,
});

export const CidrScopeRuleSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.literal("cidr"),
  target: CanonicalCidrTargetSchema,
  portRanges: PortRestrictionsSchema,
});

export const DomainScopeRuleSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.literal("domain"),
  target: CanonicalHostnameTargetSchema,
  includeSubdomains: z.boolean(),
  portRanges: PortRestrictionsSchema,
});

export const UrlOriginScopeRuleSchema = z.strictObject({
  id: IdentifierSchema,
  kind: z.literal("url-origin"),
  origin: CanonicalUrlOriginSchema,
  portRanges: PortRestrictionsSchema,
});

export const SavedScopeRuleSchema = z.discriminatedUnion("kind", [
  ExactIpScopeRuleSchema,
  CidrScopeRuleSchema,
  DomainScopeRuleSchema,
  UrlOriginScopeRuleSchema,
]);

export const DirectComparisonProvenanceSchema = z.strictObject({
  kind: z.literal("direct"),
});

export const HostnameResolutionProvenanceSchema = z.strictObject({
  kind: z.literal("hostname_resolution"),
  actionId: IdentifierSchema,
  sourceHostname: CanonicalHostnameTargetSchema,
});

export const RedirectProvenanceSchema = z.strictObject({
  kind: z.literal("redirect"),
  actionId: IdentifierSchema,
  sourceOrigin: CanonicalUrlOriginSchema,
  sourceResolvedAddress: CanonicalIpTargetSchema.nullable(),
  destinationResolvedAddress: CanonicalIpTargetSchema.nullable(),
});

export const ScopeComparisonProvenanceSchema = z.discriminatedUnion("kind", [
  DirectComparisonProvenanceSchema,
  HostnameResolutionProvenanceSchema,
  RedirectProvenanceSchema,
]);

export const ScopeComparisonSubjectSchema = z
  .strictObject({
    target: CanonicalTargetSchema,
    declaredPorts: DeclaredPortsSchema,
    provenance: ScopeComparisonProvenanceSchema,
  })
  .superRefine((subject, context) => {
    if (
      subject.provenance.kind === "hostname_resolution" &&
      subject.target.kind !== "ip"
    ) {
      context.addIssue({
        code: "custom",
        message: "hostname resolution provenance requires an IP target",
        path: ["target"],
      });
    }
    if (subject.provenance.kind === "redirect" && subject.target.kind !== "url") {
      context.addIssue({
        code: "custom",
        message: "redirect provenance requires a URL target",
        path: ["target"],
      });
    }
  });

export const SavedScopeComparisonInputSchema = z
  .strictObject({
    currentActionId: IdentifierSchema,
    scopeRevisionId: IdentifierSchema.nullable(),
    rules: z.array(SavedScopeRuleSchema),
    subjects: z.array(ScopeComparisonSubjectSchema),
  })
  .superRefine((input, context) => {
    if (input.scopeRevisionId === null && input.rules.length > 0) {
      context.addIssue({
        code: "custom",
        message: "a null revision cannot have active rules",
        path: ["rules"],
      });
    }

    const ruleIds = new Set<string>();
    for (const [index, rule] of input.rules.entries()) {
      if (ruleIds.has(rule.id)) {
        context.addIssue({
          code: "custom",
          message: "duplicate rule id",
          path: ["rules", index, "id"],
        });
      }
      ruleIds.add(rule.id);
    }

    for (const [index, subject] of input.subjects.entries()) {
      if (
        subject.provenance.kind !== "direct" &&
        subject.provenance.actionId !== input.currentActionId
      ) {
        context.addIssue({
          code: "custom",
          message: "provenance must belong to the current action",
          path: ["subjects", index, "provenance", "actionId"],
        });
      }
    }
  });

export const ScopeComparisonReasonCodeSchema = z.enum([
  "active_scope_empty",
  "host_outside_scope",
  "no_exact_ip_rule",
  "origin_mismatch",
  "ports_uncovered",
  "ports_unspecified",
  "redirect_origin_outside_scope",
]);

export const ScopeSubjectComparisonFactSchema = z.strictObject({
  subject: ScopeComparisonSubjectSchema,
  outsideScope: z.boolean(),
  matchedRuleIds: z.array(IdentifierSchema),
  reason: ScopeComparisonReasonCodeSchema.nullable(),
  uncoveredPorts: z.array(PortSchema),
});

export const SavedScopeComparisonSchema = z.strictObject({
  scopeRevisionId: IdentifierSchema.nullable(),
  outsideScope: z.boolean(),
  matchedRuleIds: z.array(IdentifierSchema),
  outsideSubjects: z.array(ScopeComparisonSubjectSchema),
  subjectFacts: z.array(ScopeSubjectComparisonFactSchema),
  reasonCodes: z.array(ScopeComparisonReasonCodeSchema),
});

export const ScopeDomainErrorCodeSchema = z.enum([
  "duplicate_scope_rule_id",
  "empty_port_restriction",
  "invalid_current_action_provenance",
  "invalid_port_range",
  "invalid_scope_input",
  "invalid_scope_revision",
]);

const InvalidPortRangeErrorSchema = z.union([
  z.strictObject({ code: z.literal("invalid_port_range") }),
  z.strictObject({
    code: z.literal("invalid_port_range"),
    port: z.number().finite(),
  }),
  z.strictObject({
    code: z.literal("invalid_port_range"),
    port: z.number().finite(),
    minimumPort: z.literal(1),
  }),
  z.strictObject({
    code: z.literal("invalid_port_range"),
    port: z.number().finite(),
    maximumPort: z.literal(65_535),
  }),
  z.strictObject({
    code: z.literal("invalid_port_range"),
    from: z.number().finite(),
    to: z.number().finite(),
  }),
]);

export const ScopeDomainErrorSchema = z.union([
  InvalidPortRangeErrorSchema,
  z.strictObject({ code: z.literal("duplicate_scope_rule_id") }),
  z.strictObject({ code: z.literal("empty_port_restriction") }),
  z.strictObject({ code: z.literal("invalid_current_action_provenance") }),
  z.strictObject({ code: z.literal("invalid_scope_input") }),
  z.strictObject({ code: z.literal("invalid_scope_revision") }),
]);

export const PortRangeNormalizationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), ranges: z.array(ScopePortRangeSchema) }),
  z.strictObject({ ok: z.literal(false), error: ScopeDomainErrorSchema }),
]);

export const ScopeRuleNormalizationResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), rules: z.array(SavedScopeRuleSchema) }),
  z.strictObject({ ok: z.literal(false), error: ScopeDomainErrorSchema }),
]);

export const SavedScopeComparisonResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), comparison: SavedScopeComparisonSchema }),
  z.strictObject({ ok: z.literal(false), error: ScopeDomainErrorSchema }),
]);

export const ConcreteTargetCardinalityInputSchema = z.strictObject({
  targets: z.array(z.union([CanonicalIpTargetSchema, CanonicalCidrTargetSchema])),
});

export const SaturatedCardinalitySchema = z
  .strictObject({
    estimatedConcreteTargets: z.number().int().min(0).max(4_097),
    countSaturated: z.boolean(),
    largeTargetWarning: z.boolean(),
  })
  .superRefine((result, context) => {
    const saturated = result.estimatedConcreteTargets === 4_097;
    if (
      result.countSaturated !== saturated ||
      result.largeTargetWarning !== saturated
    ) {
      context.addIssue({
        code: "custom",
        message: "cardinality saturation facts are inconsistent",
      });
    }
  });

export const ExecutionRepresentationSchema = z.enum([
  "compact",
  "streamed_expansion",
]);

export const ExecutionCapabilityInputSchema = z.strictObject({
  supportsCompactRange: z.boolean(),
  supportsStreamingExpansion: z.boolean(),
});

export const ExecutionCapabilityResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    executionRepresentation: ExecutionRepresentationSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({ code: z.literal("capability_error") }),
  }),
]);

export type ScopePortRangeInput = z.infer<typeof ScopePortRangeInputSchema>;
export type ScopePortRange = z.infer<typeof ScopePortRangeSchema>;
export type DeclaredPorts = z.infer<typeof DeclaredPortsSchema>;
export type CanonicalUrlOrigin = z.infer<typeof CanonicalUrlOriginSchema>;
export type ExactIpScopeRule = z.infer<typeof ExactIpScopeRuleSchema>;
export type CidrScopeRule = z.infer<typeof CidrScopeRuleSchema>;
export type DomainScopeRule = z.infer<typeof DomainScopeRuleSchema>;
export type UrlOriginScopeRule = z.infer<typeof UrlOriginScopeRuleSchema>;
export type SavedScopeRule = z.infer<typeof SavedScopeRuleSchema>;
export type ScopeComparisonProvenance = z.infer<
  typeof ScopeComparisonProvenanceSchema
>;
export type ScopeComparisonSubject = z.infer<
  typeof ScopeComparisonSubjectSchema
>;
export type SavedScopeComparisonInput = z.infer<
  typeof SavedScopeComparisonInputSchema
>;
export type ScopeComparisonReasonCode = z.infer<
  typeof ScopeComparisonReasonCodeSchema
>;
export type ScopeSubjectComparisonFact = z.infer<
  typeof ScopeSubjectComparisonFactSchema
>;
export type SavedScopeComparison = z.infer<typeof SavedScopeComparisonSchema>;
export type ScopeDomainError = z.infer<typeof ScopeDomainErrorSchema>;
export type PortRangeNormalizationResult = z.infer<
  typeof PortRangeNormalizationResultSchema
>;
export type ScopeRuleNormalizationResult = z.infer<
  typeof ScopeRuleNormalizationResultSchema
>;
export type SavedScopeComparisonResult = z.infer<
  typeof SavedScopeComparisonResultSchema
>;
export type ConcreteTargetCardinalityInput = z.infer<
  typeof ConcreteTargetCardinalityInputSchema
>;
export type SaturatedCardinality = z.infer<typeof SaturatedCardinalitySchema>;
export type ExecutionRepresentation = z.infer<
  typeof ExecutionRepresentationSchema
>;
export type ExecutionCapabilityInput = z.infer<
  typeof ExecutionCapabilityInputSchema
>;
export type ExecutionCapabilityResult = z.infer<
  typeof ExecutionCapabilityResultSchema
>;
