import { z } from "zod";

export const COMMAND_CANONICALIZATION_PROFILE = "command-json-v1" as const;
export const MAX_CANONICAL_JSON_BYTES = 1_048_576;
export const MAX_CANONICAL_JSON_DEPTH = 32;

export const IdempotencyKeySchema = z
  .string()
  .min(22)
  .max(128)
  .regex(/^[\x20-\x7e]+$/);

export const CommandActorIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x20-\x7e]+$/);

export const ConcreteCommandRouteSchema = z
  .string()
  .min(1)
  .max(2_048)
  .regex(/^\/api\/v1\/[\x21-\x7e]*$/)
  .refine((route) => !route.includes("?") && !route.includes("#"));

export const CommandOperationSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

export const CommandRequestDigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/);

export const CommandResponseStatusSchema = z.number().int().min(200).max(599);

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.json();

export type CanonicalJsonErrorCode =
  | "canonical_depth_exceeded"
  | "canonical_size_exceeded"
  | "canonical_value_unsupported";

export type CanonicalJsonResult =
  | { ok: true; canonicalJson: string }
  | { ok: false; error: { code: CanonicalJsonErrorCode } };

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) as number;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

interface SerializationState {
  active: Set<object>;
  failure: CanonicalJsonErrorCode | undefined;
}

function serializeCanonical(
  value: unknown,
  depth: number,
  state: SerializationState,
): string | undefined {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      state.failure = "canonical_value_unsupported";
      return undefined;
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (hasUnpairedSurrogate(value)) {
      state.failure = "canonical_value_unsupported";
      return undefined;
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    state.failure = "canonical_value_unsupported";
    return undefined;
  }
  if (depth >= MAX_CANONICAL_JSON_DEPTH || state.active.has(value)) {
    state.failure = state.active.has(value)
      ? "canonical_value_unsupported"
      : "canonical_depth_exceeded";
    return undefined;
  }

  state.active.add(value);
  let serialized: string | undefined;
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value as object);
    const ownKeys = Reflect.ownKeys(descriptors);
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !("value" in lengthDescriptor) ||
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      ownKeys.length !== length + 1
    ) {
      state.failure = "canonical_value_unsupported";
    } else if (length > (MAX_CANONICAL_JSON_BYTES - 1) / 2) {
      state.failure = "canonical_size_exceeded";
    } else {
      const entries: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const key = String(index);
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          state.failure = "canonical_value_unsupported";
          break;
        }
        const entry = serializeCanonical(descriptor.value, depth + 1, state);
        if (entry === undefined) break;
        entries.push(entry);
      }
      if (state.failure === undefined) serialized = `[${entries.join(",")}]`;
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      ownKeys.some((key) => typeof key !== "string") ||
      Object.values(descriptors).some(
        (descriptor) =>
          !descriptor.enumerable ||
          !("value" in descriptor) ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined,
      )
    ) {
      state.failure = "canonical_value_unsupported";
    } else {
      const entries: string[] = [];
      for (const key of (ownKeys as string[]).sort()) {
        if (hasUnpairedSurrogate(key)) {
          state.failure = "canonical_value_unsupported";
          break;
        }
        const descriptor = descriptors[key];
        const entry = serializeCanonical(descriptor?.value, depth + 1, state);
        if (entry === undefined) break;
        entries.push(`${JSON.stringify(key)}:${entry}`);
      }
      if (state.failure === undefined) serialized = `{${entries.join(",")}}`;
    }
  }
  state.active.delete(value);
  return serialized;
}

export function canonicalizeJson(value: unknown): CanonicalJsonResult {
  const state: SerializationState = { active: new Set(), failure: undefined };
  let canonicalJson: string | undefined;
  try {
    canonicalJson = serializeCanonical(value, 0, state);
  } catch {
    return { ok: false, error: { code: "canonical_value_unsupported" } };
  }
  if (canonicalJson === undefined) {
    return {
      ok: false,
      error: { code: state.failure ?? "canonical_value_unsupported" },
    };
  }
  if (utf8ByteLength(canonicalJson) > MAX_CANONICAL_JSON_BYTES) {
    return { ok: false, error: { code: "canonical_size_exceeded" } };
  }
  return { ok: true, canonicalJson };
}
