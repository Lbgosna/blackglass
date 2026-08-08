import { z } from "zod";

export const HealthResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
