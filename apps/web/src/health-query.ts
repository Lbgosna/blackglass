import { HealthResponseSchema, type HealthResponse } from "@blackglass/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";

export const HEALTH_QUERY_KEY = ["system", "health"] as const;
export const HEALTH_QUERY_ERROR_MESSAGE = "The control plane health check failed.";

export class HealthQueryError extends Error {
  constructor() {
    super(HEALTH_QUERY_ERROR_MESSAGE);
    this.name = "HealthQueryError";
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new HealthQueryError();

    const payload: unknown = await response.json();
    const result = HealthResponseSchema.safeParse(payload);
    if (!result.success) throw new HealthQueryError();
    return result.data;
  } catch (error) {
    if (error instanceof HealthQueryError) throw error;
    throw new HealthQueryError();
  }
}

export const healthQueryOptions = queryOptions({
  queryKey: HEALTH_QUERY_KEY,
  // Let the shared request settle so a StrictMode remount reuses the same in-flight query.
  queryFn: fetchHealth,
});

export function useHealthQuery() {
  return useQuery(healthQueryOptions);
}
