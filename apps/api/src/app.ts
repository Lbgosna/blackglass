import {
  HealthResponseSchema,
  SYSTEM_STATUS_VERSION,
  SystemStatusResponseSchema,
  type Readiness,
} from "@blackglass/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import type { EngagementRepository } from "@blackglass/db";

import { registerEngagementRoutes } from "./engagement-routes.js";

interface BuildAppOptions {
  getDevelopmentStorageReadiness: () => Readiness | Promise<Readiness>;
  engagementRepository: Pick<
    EngagementRepository,
    "getEngagement" | "listEngagements" | "listScopeRevisions"
  >;
}

export function buildApp({
  engagementRepository,
  getDevelopmentStorageReadiness,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  registerEngagementRoutes(app, engagementRepository);

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
