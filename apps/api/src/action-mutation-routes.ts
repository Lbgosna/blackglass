import {
  ActionIdParamsSchema,
  ActionMutationErrorSchema,
  ActionMutationQuerySchema,
  ActionResponseSchema,
  AddScopeAndRunActionRequestSchema,
  CancelActionRequestSchema,
  ContinueActionRequestSchema,
  CreateActionRequestSchema,
  EngagementIdParamsSchema,
  IdempotencyKeySchema,
  JsonValueSchema,
  type ActionMutationError,
  type JsonValue,
} from "@blackglass/contracts";
import type {
  ActionRepositoryError,
  EngagementWriteTransaction,
  OperatorCommandRepository,
  OperatorCommandResult,
  RepositoryResult,
} from "@blackglass/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { prepareLocalOperatorCommand } from "./operator-command.js";

type CommandRepository = Pick<
  OperatorCommandRepository,
  "executeOperatorCommand"
>;

class InvalidMutationResponseError extends Error {}

function mutationError(
  error: ActionRepositoryError,
  defaults: { resourceType: "engagement" | "action"; resourceId: string },
): { status: 400 | 404 | 409 | 500 | 503; body: ActionMutationError } {
  switch (error.code) {
    case "invalid_repository_input":
      return { status: 400, body: { code: "invalid_request" } };
    case "engagement_not_found":
    case "action_not_found":
      return { status: 404, body: { code: error.code } };
    case "engagement_archived":
    case "invalid_action_transition":
    case "action_already_queued":
    case "capability_error_not_overridable":
    case "snapshot_binding_mismatch":
    case "invalid_run_transition":
    case "run_not_retryable":
    case "invalid_engagement_transition":
      return {
        status: 409,
        body: {
          code:
            error.code === "invalid_engagement_transition"
              ? "invalid_action_transition"
              : error.code,
        },
      };
    case "revision_conflict":
      return {
        status: 409,
        body: {
          code: error.code,
          resourceType: error.resourceType ?? defaults.resourceType,
          resourceId: error.resourceId ?? defaults.resourceId,
          currentRevision: error.currentRevision,
        },
      };
    case "storage_busy":
      return { status: 503, body: { code: error.code } };
    case "invalid_persisted_data":
      return { status: 500, body: { code: error.code } };
  }
}

function definitiveResponse(
  result: RepositoryResult<unknown, ActionRepositoryError>,
  successStatus: 200 | 201,
  defaults: { resourceType: "engagement" | "action"; resourceId: string },
): { status: number; body: JsonValue } {
  if (result.ok) {
    const validated = ActionResponseSchema.safeParse(result.value);
    if (!validated.success) throw new InvalidMutationResponseError();
    const body = JsonValueSchema.safeParse(validated.data);
    if (!body.success) throw new InvalidMutationResponseError();
    return { status: successStatus, body: body.data };
  }
  return mutationError(result.error, defaults);
}

function sendFixedError(
  reply: FastifyReply,
  status: 400 | 409 | 500 | 503,
  code:
    | "invalid_request"
    | "idempotency_conflict"
    | "invalid_persisted_data"
    | "storage_busy",
) {
  return reply
    .code(status)
    .type("application/json")
    .send(ActionMutationErrorSchema.parse({ code }));
}

function sendCommandResult(
  reply: FastifyReply,
  result: OperatorCommandResult,
  successStatus: 200 | 201,
) {
  if (!result.ok) {
    switch (result.error.code) {
      case "invalid_command_input":
        return sendFixedError(reply, 400, "invalid_request");
      case "idempotency_conflict":
        return sendFixedError(reply, 409, result.error.code);
      case "storage_busy":
        return sendFixedError(reply, 503, result.error.code);
      case "invalid_persisted_data":
        return sendFixedError(reply, 500, result.error.code);
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(result.response.bodyJson);
  } catch {
    return sendFixedError(reply, 500, "invalid_persisted_data");
  }
  const schema =
    result.response.status === successStatus
      ? ActionResponseSchema
      : ActionMutationErrorSchema;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return sendFixedError(reply, 500, "invalid_persisted_data");
  }
  return reply
    .code(result.response.status)
    .type("application/json")
    .send(parsed.data);
}

function commandKey(request: FastifyRequest): string | undefined {
  const values: string[] = [];
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === "idempotency-key") {
      values.push(request.raw.rawHeaders[index + 1] ?? "");
    }
  }
  if (values.length !== 1) return undefined;
  const parsed = IdempotencyKeySchema.safeParse(values[0]);
  return parsed.success ? parsed.data : undefined;
}

interface ExecuteOptions {
  key: string;
  route: string;
  operation: string;
  path: JsonValue;
  query: JsonValue;
  body: JsonValue;
  successStatus: 200 | 201;
  mutate: (transaction: EngagementWriteTransaction) => {
    status: number;
    body: JsonValue;
  };
}

function execute(
  reply: FastifyReply,
  repository: CommandRepository,
  options: ExecuteOptions,
) {
  const prepared = prepareLocalOperatorCommand({
    key: options.key,
    route: options.route,
    operation: options.operation,
    path: options.path,
    query: options.query,
    body: options.body,
  });
  if (!prepared.ok) return sendFixedError(reply, 400, "invalid_request");
  const result = repository.executeOperatorCommand(
    prepared.command,
    options.mutate,
  );
  return sendCommandResult(reply, result, options.successStatus);
}

export function registerActionMutationRoutes(
  app: FastifyInstance,
  repository: CommandRepository,
): void {
  app.post(
    "/api/v1/engagements/:engagementId/actions",
    async (request, reply) => {
      const key = commandKey(request);
      const params = EngagementIdParamsSchema.safeParse(request.params);
      const body = CreateActionRequestSchema.safeParse(request.body);
      const query = ActionMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/actions`;
      return execute(reply, repository, {
        key,
        route,
        operation: "create",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 201,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.planOperatorAction(params.data.engagementId, body.data),
            201,
            {
              resourceType: "engagement",
              resourceId: params.data.engagementId,
            },
          ),
      });
    },
  );

  app.post(
    "/api/v1/engagements/:engagementId/actions/:actionId/continue",
    async (request, reply) => {
      const key = commandKey(request);
      const params = ActionIdParamsSchema.safeParse(request.params);
      const body = ContinueActionRequestSchema.safeParse(request.body);
      const query = ActionMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/actions/${params.data.actionId}/continue`;
      return execute(reply, repository, {
        key,
        route,
        operation: "continue",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 200,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.continueAction({
              engagementId: params.data.engagementId,
              actionId: params.data.actionId,
              expectedRevision: body.data.expectedRevision,
              snapshotVersion: body.data.snapshotVersion,
              snapshotBinding: body.data.snapshotBinding,
              occurredAt: transaction.now().toISOString(),
            }),
            200,
            { resourceType: "action", resourceId: params.data.actionId },
          ),
      });
    },
  );

  app.post(
    "/api/v1/engagements/:engagementId/actions/:actionId/add-scope-and-run",
    async (request, reply) => {
      const key = commandKey(request);
      const params = ActionIdParamsSchema.safeParse(request.params);
      const body = AddScopeAndRunActionRequestSchema.safeParse(request.body);
      const query = ActionMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/actions/${params.data.actionId}/add-scope-and-run`;
      return execute(reply, repository, {
        key,
        route,
        operation: "add_scope_and_run",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 200,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.addScopeAndRunOperatorAction(
              params.data.engagementId,
              params.data.actionId,
              body.data,
            ),
            200,
            { resourceType: "action", resourceId: params.data.actionId },
          ),
      });
    },
  );

  app.post(
    "/api/v1/engagements/:engagementId/actions/:actionId/cancel",
    async (request, reply) => {
      const key = commandKey(request);
      const params = ActionIdParamsSchema.safeParse(request.params);
      const body = CancelActionRequestSchema.safeParse(request.body);
      const query = ActionMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/actions/${params.data.actionId}/cancel`;
      return execute(reply, repository, {
        key,
        route,
        operation: "cancel",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 200,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.cancelAction({
              engagementId: params.data.engagementId,
              actionId: params.data.actionId,
              expectedRevision: body.data.expectedRevision,
            }),
            200,
            { resourceType: "action", resourceId: params.data.actionId },
          ),
      });
    },
  );
}
