import {
  EngagementMutationErrorSchema,
  type EngagementMutationError,
} from "@blackglass/contracts";

export const ENGAGEMENTS_QUERY_ERROR_MESSAGE = "The engagement list request failed.";
export const ENGAGEMENT_MUTATION_ERROR_MESSAGE = "The engagement request failed.";

export const ENGAGEMENT_MUTATION_ERROR_COPY = {
  invalid_request: "The request was not accepted. Check the fields and try again.",
  engagement_not_found: "That engagement is no longer available.",
  engagement_archived: "This engagement is archived.",
  invalid_engagement_transition: "That lifecycle action is not valid now.",
  idempotency_conflict: "This request did not match a previous attempt. Try again.",
  revision_conflict: "This engagement changed. Refreshing the latest revision.",
  invalid_persisted_data: "The server returned data this client cannot use.",
  storage_busy: "Storage is busy. Try again.",
  request_failed: ENGAGEMENT_MUTATION_ERROR_MESSAGE,
} as const;

export class EngagementsQueryError extends Error {
  constructor() {
    super(ENGAGEMENTS_QUERY_ERROR_MESSAGE);
    this.name = "EngagementsQueryError";
  }
}

export class EngagementMutationClientError extends Error {
  readonly code: keyof typeof ENGAGEMENT_MUTATION_ERROR_COPY;
  readonly currentRevision?: number;
  readonly resourceId?: string;

  constructor(
    code: keyof typeof ENGAGEMENT_MUTATION_ERROR_COPY,
    details?: { currentRevision: number; resourceId: string },
  ) {
    super(ENGAGEMENT_MUTATION_ERROR_COPY[code]);
    this.name = "EngagementMutationClientError";
    this.code = code;
    if (details) {
      this.currentRevision = details.currentRevision;
      this.resourceId = details.resourceId;
    }
  }
}

export function isRevisionConflict(
  error: unknown,
): error is EngagementMutationClientError & {
  code: "revision_conflict";
  currentRevision: number;
} {
  return (
    error instanceof EngagementMutationClientError &&
    error.code === "revision_conflict" &&
    typeof error.currentRevision === "number"
  );
}

export function parseEngagementMutationError(payload: unknown): EngagementMutationClientError {
  const parsed = EngagementMutationErrorSchema.safeParse(payload);
  if (!parsed.success) return new EngagementMutationClientError("request_failed");
  return mutationErrorFromContract(parsed.data);
}

export function mutationErrorFromContract(
  error: EngagementMutationError,
): EngagementMutationClientError {
  if (error.code === "revision_conflict") {
    return new EngagementMutationClientError("revision_conflict", {
      currentRevision: error.currentRevision,
      resourceId: error.resourceId,
    });
  }
  return new EngagementMutationClientError(error.code);
}

export function engagementMutationMessage(error: unknown): string {
  if (error instanceof EngagementMutationClientError) return error.message;
  return ENGAGEMENT_MUTATION_ERROR_MESSAGE;
}
