import {
  EngagementListResponseSchema,
  type Engagement,
} from "@blackglass/contracts";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { EngagementsQueryError } from "./errors.js";

export const ENGAGEMENTS_QUERY_KEY = ["engagements"] as const;

export async function fetchEngagements(signal?: AbortSignal): Promise<Engagement[]> {
  try {
    const response = await fetch("/api/v1/engagements", signal ? { signal } : undefined);
    if (response.status !== 200) throw new EngagementsQueryError();

    const payload: unknown = await response.json();
    const result = EngagementListResponseSchema.safeParse(payload);
    if (!result.success) throw new EngagementsQueryError();
    return result.data;
  } catch (error) {
    if (error instanceof EngagementsQueryError) throw error;
    throw new EngagementsQueryError();
  }
}

export const engagementsQueryOptions = queryOptions({
  queryKey: ENGAGEMENTS_QUERY_KEY,
  queryFn: ({ signal }) => fetchEngagements(signal),
});

export function useEngagementsQuery() {
  return useQuery(engagementsQueryOptions);
}

export function partitionEngagements(engagements: readonly Engagement[]) {
  const active: Engagement[] = [];
  const archived: Engagement[] = [];
  for (const engagement of engagements) {
    if (engagement.status === "archived") archived.push(engagement);
    else active.push(engagement);
  }
  return { active, archived };
}
