import {
  HealthResponseSchema,
  EngagementMutationErrorSchema,
  SYSTEM_STATUS_VERSION,
  SystemStatusResponseSchema,
  type Readiness,
} from "@blackglass/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import type { EngagementRepository, OperatorCommandRepository } from "@blackglass/db";

import { registerActionMutationRoutes } from "./action-mutation-routes.js";
import { registerActionRoutes } from "./action-routes.js";
import { registerEngagementMutationRoutes } from "./engagement-mutation-routes.js";
import { registerEngagementRoutes } from "./engagement-routes.js";

interface BuildAppOptions {
  getDevelopmentStorageReadiness: () => Readiness | Promise<Readiness>;
  engagementRepository: Pick<
    EngagementRepository,
    | "getEngagement"
    | "listEngagements"
    | "listScopeRevisions"
    | "getAction"
    | "retryActionContext"
  >;
  operatorCommandRepository?: Pick<
    OperatorCommandRepository,
    "executeOperatorCommand"
  >;
}

export function buildApp({
  engagementRepository,
  getDevelopmentStorageReadiness,
  operatorCommandRepository,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _request, reply) => {
    const clientError =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode < 500;
    return reply
      .code(clientError ? 400 : 500)
      .type("application/json")
      .send(
        EngagementMutationErrorSchema.parse({
          code: clientError ? "invalid_request" : "invalid_persisted_data",
        }),
      );
  });

  registerEngagementRoutes(app, engagementRepository);
  registerActionRoutes(app, engagementRepository);
  if (operatorCommandRepository !== undefined) {
    registerEngagementMutationRoutes(app, operatorCommandRepository);
    registerActionMutationRoutes(app, operatorCommandRepository);
  }

  app.get("/health", async (_request, reply) => {
    const health = HealthResponseSchema.parse({ status: "ok" });
    return reply.code(200).type("application/json").send(health);
  });

  app.get("/api/v1/system/status", async (_request, reply) => {
    let developmentStorage: Readiness;
    try {
      developmentStorage = await getDevelopmentStorageReadiness();
    } catch {
      developmentStorage = "not_ready";
    }
    const status = SystemStatusResponseSchema.parse({
      version: SYSTEM_STATUS_VERSION,
      overall: developmentStorage,
      developmentStorage,
    });
    return reply
      .code(status.overall === "ready" ? 200 : 503)
      .type("application/json")
      .send(status);
  });

  return app;
}
