import { HealthResponseSchema } from "@blackglass/contracts";
import Fastify, { type FastifyInstance } from "fastify";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (_request, reply) => {
    const health = HealthResponseSchema.parse({ status: "ok" });
    return reply.code(200).type("application/json").send(health);
  });

  return app;
}
