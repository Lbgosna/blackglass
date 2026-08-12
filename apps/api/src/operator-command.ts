import { createHash } from "node:crypto";

import {
  COMMAND_CANONICALIZATION_PROFILE,
  CommandOperationSchema,
  ConcreteCommandRouteSchema,
  IdempotencyKeySchema,
  canonicalizeJson,
  type JsonValue,
} from "@blackglass/contracts";
import type { PreparedOperatorCommand } from "@blackglass/db";

export const LOCAL_OPERATOR_ACTOR_ID = "local-operator-v1" as const;

interface LocalOperatorCommandInput {
  key: string;
  route: string;
  operation: string;
  /** Successful outputs from the route's path, query, and body schemas. */
  path: JsonValue;
  query: JsonValue;
  body: JsonValue;
}

export type PrepareLocalOperatorCommandResult =
  | { ok: true; command: PreparedOperatorCommand }
  | { ok: false; error: { code: "invalid_command_input" } };

export function prepareLocalOperatorCommand(
  input: LocalOperatorCommandInput,
): PrepareLocalOperatorCommandResult {
  const key = IdempotencyKeySchema.safeParse(input.key);
  const route = ConcreteCommandRouteSchema.safeParse(input.route);
  const operation = CommandOperationSchema.safeParse(input.operation);
  if (!key.success || !route.success || !operation.success) {
    return { ok: false, error: { code: "invalid_command_input" } };
  }
  const canonical = canonicalizeJson({
    actorId: LOCAL_OPERATOR_ACTOR_ID,
    body: input.body,
    canonicalizationProfile: COMMAND_CANONICALIZATION_PROFILE,
    operation: operation.data,
    path: input.path,
    query: input.query,
    route: route.data,
  });
  if (!canonical.ok) {
    return { ok: false, error: { code: "invalid_command_input" } };
  }
  const requestDigest = `sha256:${createHash("sha256")
    .update(canonical.canonicalJson, "utf8")
    .digest("hex")}`;
  return {
    ok: true,
    command: {
      actorId: LOCAL_OPERATOR_ACTOR_ID,
      route: route.data,
      operation: operation.data,
      idempotencyKey: key.data,
      canonicalizationProfile: COMMAND_CANONICALIZATION_PROFILE,
      requestDigest,
    },
  };
}
