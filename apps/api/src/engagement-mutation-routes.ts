import {
  AppendScopeRevisionRequestSchema,
  CreateEngagementRequestSchema,
  EngagementIdParamsSchema,
  EngagementMutationErrorSchema,
  EngagementMutationQuerySchema,
  EngagementMutationResponseSchema,
  EngagementRevisionRequestSchema,
  IdempotencyKeySchema,
  JsonValueSchema,
  ScopeRevisionMutationResponseSchema,
  UpdateAutoContinueWarningsRequestSchema,
  type EngagementMutationError,
  type JsonValue,
} from "@blackglass/contracts";
import type {
  EngagementWriteTransaction,
  OperatorCommandRepository,
  OperatorCommandResult,
  RepositoryError,
  RepositoryResult,
} from "@blackglass/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { prepareLocalOperatorCommand } from "./operator-command.js";

type CommandRepository = Pick<
  OperatorCommandRepository,
  "executeOperatorCommand"
>;

interface ResponseSchema {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | { success: false };
}

class InvalidMutationResponseError extends Error {}

function mutationError(
  error: RepositoryError,
  engagementId?: string,
): { status: 400 | 404 | 409 | 500 | 503; body: EngagementMutationError } {
  switch (error.code) {
    case "invalid_repository_input":
      return { status: 400, body: { code: "invalid_request" } };
    case "engagement_not_found":
      return { status: 404, body: { code: error.code } };
    case "engagement_archived":
    case "invalid_engagement_transition":
      return { status: 409, body: { code: error.code } };
    case "revision_conflict":
      return {
        status: 409,
        body: {
          code: error.code,
          resourceType: "engagement",
          resourceId: engagementId ?? "",
          currentRevision: error.currentRevision,
        },
      };
    case "storage_busy":
      return { status: 503, body: { code: error.code } };
    case "invalid_persisted_data":
      return { status: 500, body: { code: error.code } };
  }
}

function definitiveResponse<T>(
  result: RepositoryResult<T>,
  successStatus: 200 | 201,
  successSchema: ResponseSchema,
  engagementId?: string,
): { status: number; body: JsonValue } {
  if (result.ok) {
    const validated = successSchema.safeParse(result.value);
    if (!validated.success) throw new InvalidMutationResponseError();
    const body = JsonValueSchema.safeParse(validated.data);
    if (!body.success) throw new InvalidMutationResponseError();
    return { status: successStatus, body: body.data };
  }
  return mutationError(result.error, engagementId);
}

function sendFixedError(
  reply: FastifyReply,
  status: 400 | 409 | 500 | 503,
  code: "invalid_request" | "idempotency_conflict" | "invalid_persisted_data" | "storage_busy",
) {
  return reply
    .code(status)
    .type("application/json")
    .send(EngagementMutationErrorSchema.parse({ code }));
}

function sendCommandResult(
  reply: FastifyReply,
  result: OperatorCommandResult,
  successStatus: 200 | 201,
  successSchema: ResponseSchema,
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
  const schema = result.response.status === successStatus
    ? successSchema
    : EngagementMutationErrorSchema;
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
  successSchema: ResponseSchema;
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
  const result = repository.executeOperatorCommand(prepared.command, options.mutate);
  return sendCommandResult(
    reply,
    result,
    options.successStatus,
    options.successSchema,
  );
}

export function registerEngagementMutationRoutes(
  app: FastifyInstance,
  repository: CommandRepository,
): void {
  app.post("/api/v1/engagements", async (request, reply) => {
    const key = commandKey(request);
    const body = CreateEngagementRequestSchema.safeParse(request.body);
    const query = EngagementMutationQuerySchema.safeParse(request.query);
    if (key === undefined || !body.success || !query.success) {
      return sendFixedError(reply, 400, "invalid_request");
    }
    return execute(reply, repository, {
      key,
      route: "/api/v1/engagements",
      operation: "create",
      path: {},
      query: query.data,
      body: JsonValueSchema.parse(body.data),
      successStatus: 201,
      successSchema: EngagementMutationResponseSchema,
      mutate: (transaction) =>
        definitiveResponse(
          transaction.createEngagement(body.data),
          201,
          EngagementMutationResponseSchema,
        ),
    });
  });

  for (const operation of ["archive", "reopen"] as const) {
    app.post(`/api/v1/engagements/:engagementId/${operation}`, async (request, reply) => {
      const key = commandKey(request);
      const params = EngagementIdParamsSchema.safeParse(request.params);
      const body = EngagementRevisionRequestSchema.safeParse(request.body);
      const query = EngagementMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/${operation}`;
      return execute(reply, repository, {
        key,
        route,
        operation,
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 200,
        successSchema: EngagementMutationResponseSchema,
        mutate: (transaction) =>
          definitiveResponse(
            transaction[operation](
              params.data.engagementId,
              body.data.expectedRevision,
            ),
            200,
            EngagementMutationResponseSchema,
            params.data.engagementId,
          ),
      });
    });
  }

  app.patch(
    "/api/v1/engagements/:engagementId/auto-continue-warnings",
    async (request, reply) => {
      const key = commandKey(request);
      const params = EngagementIdParamsSchema.safeParse(request.params);
      const body = UpdateAutoContinueWarningsRequestSchema.safeParse(request.body);
      const query = EngagementMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/auto-continue-warnings`;
      return execute(reply, repository, {
        key,
        route,
        operation: "update_auto_continue_warnings",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 200,
        successSchema: EngagementMutationResponseSchema,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.updateAutoContinueWarnings(
              params.data.engagementId,
              body.data.expectedRevision,
              body.data.autoContinueWarnings,
            ),
            200,
            EngagementMutationResponseSchema,
            params.data.engagementId,
          ),
      });
    },
  );

  app.post(
    "/api/v1/engagements/:engagementId/scope-revisions",
    async (request, reply) => {
      const key = commandKey(request);
      const params = EngagementIdParamsSchema.safeParse(request.params);
      const body = AppendScopeRevisionRequestSchema.safeParse(request.body);
      const query = EngagementMutationQuerySchema.safeParse(request.query);
      if (key === undefined || !params.success || !body.success || !query.success) {
        return sendFixedError(reply, 400, "invalid_request");
      }
      const route = `/api/v1/engagements/${params.data.engagementId}/scope-revisions`;
      return execute(reply, repository, {
        key,
        route,
        operation: "append_scope_revision",
        path: params.data,
        query: query.data,
        body: JsonValueSchema.parse(body.data),
        successStatus: 201,
        successSchema: ScopeRevisionMutationResponseSchema,
        mutate: (transaction) =>
          definitiveResponse(
            transaction.appendScopeRevision({
              engagementId: params.data.engagementId,
              ...body.data,
            }),
            201,
            ScopeRevisionMutationResponseSchema,
            params.data.engagementId,
          ),
      });
    },
  );
}
