import { z } from "zod";

import {
  EngagementSchema,
  EngagementWithActiveScopeSchema,
  ScopeRevisionSchema,
} from "./engagement.js";

export const EngagementIdParamsSchema = z.strictObject({
  engagementId: EngagementSchema.shape.id,
});

export const EngagementListResponseSchema = z.array(EngagementSchema);
export const EngagementDetailResponseSchema = EngagementWithActiveScopeSchema;
export const ScopeRevisionListResponseSchema = z.array(ScopeRevisionSchema);

export const EngagementQueryErrorSchema = z.union([
  z.strictObject({ code: z.literal("invalid_request") }),
  z.strictObject({ code: z.literal("engagement_not_found") }),
  z.strictObject({ code: z.literal("invalid_persisted_data") }),
  z.strictObject({ code: z.literal("storage_busy") }),
]);

export type EngagementIdParams = z.infer<typeof EngagementIdParamsSchema>;
export type EngagementQueryError = z.infer<typeof EngagementQueryErrorSchema>;
