import {
  CreateEngagementRequestSchema,
  EngagementMutationResponseSchema,
  type CreateEngagementInput,
  type Engagement,
} from "@blackglass/contracts";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import {
  EngagementMutationClientError,
  isRevisionConflict,
  parseEngagementMutationError,
} from "./errors.js";
import { createIdempotencyKey, createIntentKeyHolder, requestFingerprint } from "./idempotency.js";
import { ENGAGEMENTS_QUERY_KEY } from "./query.js";

const SUCCESS_STATUSES = new Set([200, 201]);
const ERROR_STATUSES = new Set([400, 404, 409, 500, 503]);

export async function sendEngagementMutation(
  url: string,
  init: {
    body: unknown;
    idempotencyKey: string;
    method?: "POST" | "PATCH";
    signal?: AbortSignal;
  },
): Promise<Engagement> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": init.idempotencyKey,
      },
      body: JSON.stringify(init.body),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch {
    throw new EngagementMutationClientError("request_failed");
  }

  if (!SUCCESS_STATUSES.has(response.status) && !ERROR_STATUSES.has(response.status)) {
    throw new EngagementMutationClientError("request_failed");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EngagementMutationClientError("request_failed");
  }

  if (SUCCESS_STATUSES.has(response.status)) {
    const parsed = EngagementMutationResponseSchema.safeParse(payload);
    if (!parsed.success) throw new EngagementMutationClientError("invalid_persisted_data");
    return parsed.data;
  }

  throw parseEngagementMutationError(payload);
}

export async function createEngagementRequest(
  input: CreateEngagementInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Engagement> {
  const body = CreateEngagementRequestSchema.parse(input);
  return sendEngagementMutation("/api/v1/engagements", {
    body,
    idempotencyKey,
    ...(signal ? { signal } : {}),
  });
}

export async function archiveEngagementRequest(
  engagementId: string,
  expectedRevision: number,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Engagement> {
  return sendEngagementMutation(`/api/v1/engagements/${engagementId}/archive`, {
    body: { expectedRevision },
    idempotencyKey,
    ...(signal ? { signal } : {}),
  });
}

export async function reopenEngagementRequest(
  engagementId: string,
  expectedRevision: number,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Engagement> {
  return sendEngagementMutation(`/api/v1/engagements/${engagementId}/reopen`, {
    body: { expectedRevision },
    idempotencyKey,
    ...(signal ? { signal } : {}),
  });
}

export function upsertEngagementInCache(queryClient: QueryClient, engagement: Engagement) {
  queryClient.setQueryData<Engagement[]>(ENGAGEMENTS_QUERY_KEY, (current) => {
    if (current === undefined) return [engagement];
    const index = current.findIndex((item) => item.id === engagement.id);
    if (index === -1) {
      return [...current, engagement].sort((left, right) => {
        const created = left.createdAt.localeCompare(right.createdAt);
        return created !== 0 ? created : left.id.localeCompare(right.id);
      });
    }
    const next = current.slice();
    next[index] = engagement;
    return next;
  });
}

async function handleLifecycleError(queryClient: QueryClient, error: unknown) {
  if (isRevisionConflict(error)) {
    await queryClient.invalidateQueries({ queryKey: ENGAGEMENTS_QUERY_KEY });
  }
}

export function useCreateEngagementMutation() {
  const queryClient = useQueryClient();
  const keys = useRef(createIntentKeyHolder());

  return useMutation({
    mutationFn: (input: CreateEngagementInput) => {
      const body = CreateEngagementRequestSchema.parse(input);
      const intent = requestFingerprint(body);
      return createEngagementRequest(body, keys.current.keyFor(intent));
    },
    onSuccess: (engagement, input) => {
      upsertEngagementInCache(queryClient, engagement);
      keys.current.reset(requestFingerprint(CreateEngagementRequestSchema.parse(input)));
    },
  });
}

export function useArchiveEngagementMutation() {
  const queryClient = useQueryClient();
  const keys = useRef(createIntentKeyHolder());

  return useMutation({
    mutationFn: (input: { engagementId: string; expectedRevision: number }) => {
      const intent = `archive:${input.engagementId}:${input.expectedRevision}`;
      return archiveEngagementRequest(
        input.engagementId,
        input.expectedRevision,
        keys.current.keyFor(intent),
      );
    },
    onSuccess: (engagement, input) => {
      upsertEngagementInCache(queryClient, engagement);
      keys.current.reset(`archive:${input.engagementId}:${input.expectedRevision}`);
    },
    onError: (error) => handleLifecycleError(queryClient, error),
  });
}

export function useReopenEngagementMutation() {
  const queryClient = useQueryClient();
  const keys = useRef(createIntentKeyHolder());

  return useMutation({
    mutationFn: (input: { engagementId: string; expectedRevision: number }) => {
      const intent = `reopen:${input.engagementId}:${input.expectedRevision}`;
      return reopenEngagementRequest(
        input.engagementId,
        input.expectedRevision,
        keys.current.keyFor(intent),
      );
    },
    onSuccess: (engagement, input) => {
      upsertEngagementInCache(queryClient, engagement);
      keys.current.reset(`reopen:${input.engagementId}:${input.expectedRevision}`);
    },
    onError: (error) => handleLifecycleError(queryClient, error),
  });
}

export { createIdempotencyKey };
