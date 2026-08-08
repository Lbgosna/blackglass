import { z } from "zod";

export const SYSTEM_STATUS_VERSION = 1;

export const ReadinessSchema = z.enum(["ready", "not_ready"]);

export const SystemStatusResponseSchema = z.discriminatedUnion("overall", [
  z.strictObject({
    version: z.literal(SYSTEM_STATUS_VERSION),
    overall: z.literal("ready"),
    developmentStorage: z.literal("ready"),
  }),
  z.strictObject({
    version: z.literal(SYSTEM_STATUS_VERSION),
    overall: z.literal("not_ready"),
    developmentStorage: z.literal("not_ready"),
  }),
]);

export type Readiness = z.infer<typeof ReadinessSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
