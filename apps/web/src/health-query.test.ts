import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HEALTH_QUERY_ERROR_MESSAGE,
  HEALTH_QUERY_KEY,
  healthQueryOptions,
  HealthQueryError,
} from "./health-query.js";
import { createAppQueryClient } from "./query-client.js";

function response(payload: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  return {
    json: async () => payload,
    ok: options.ok ?? true,
    status: options.status ?? 200,
  } as Response;
}

async function captureQueryError(): Promise<Error> {
  const client = createAppQueryClient();
  try {
    await client.fetchQuery(healthQueryOptions);
    throw new Error("Expected the health query to fail.");
  } catch (error) {
    return error as Error;
  } finally {
    client.clear();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("healthQueryOptions", () => {
  it("uses a stable key and accepts the shared health contract", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);
    const client = createAppQueryClient();

    await expect(client.fetchQuery(healthQueryOptions)).resolves.toEqual({ status: "ok" });
    expect(healthQueryOptions.queryKey).toBe(HEALTH_QUERY_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("rejects a successful response that violates the shared contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(response({ status: "almost", token: "invalid-body-secret" })),
      ),
    );

    const error = await captureQueryError();

    expect(error).toBeInstanceOf(HealthQueryError);
    expect(error.message).toBe(HEALTH_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("invalid-body-secret");
  });

  it("rejects a non-success response without reading or exposing its body", async () => {
    const readBody = vi.fn(() =>
      Promise.resolve({ token: "body-secret", request: "https://local.invalid/?key=url-secret" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: readBody,
          ok: false,
          status: 503,
        } as unknown as Response),
      ),
    );

    const error = await captureQueryError();

    expect(readBody).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(HealthQueryError);
    expect(error.message).toBe(HEALTH_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("body-secret");
    expect(error.message).not.toContain("url-secret");
    expect(error.message).not.toContain("503");
  });

  it("replaces network and request details with one safe error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.reject(
          new Error("GET https://local.invalid/?token=request-secret failed with body-secret"),
        ),
      ),
    );

    const error = await captureQueryError();

    expect(error).toBeInstanceOf(HealthQueryError);
    expect(error.message).toBe(HEALTH_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("request-secret");
    expect(error.message).not.toContain("body-secret");
    expect(error.cause).toBeUndefined();
  });
});
