import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "./query-client.js";
import {
  SYSTEM_STATUS_QUERY_ERROR_MESSAGE,
  SYSTEM_STATUS_QUERY_KEY,
  systemStatusQueryOptions,
  SystemStatusQueryError,
} from "./system-status-query.js";

function response(payload: unknown, status = 200): Response {
  return {
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

async function captureQueryError(): Promise<Error> {
  const client = createAppQueryClient();
  try {
    await client.fetchQuery(systemStatusQueryOptions);
    throw new Error("Expected the system status query to fail.");
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

describe("systemStatusQueryOptions", () => {
  it("uses a stable key, an abort signal, and the shared ready contract", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(
        response({ version: 1, overall: "ready", developmentStorage: "ready" }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createAppQueryClient();

    await expect(client.fetchQuery(systemStatusQueryOptions)).resolves.toEqual({
      version: 1,
      overall: "ready",
      developmentStorage: "ready",
    });
    expect(systemStatusQueryOptions.queryKey).toBe(SYSTEM_STATUS_QUERY_KEY);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/system/status",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    client.clear();
  });

  it("accepts a valid not-ready 503 as current status data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          response(
            { version: 1, overall: "not_ready", developmentStorage: "not_ready" },
            503,
          ),
        ),
      ),
    );
    const client = createAppQueryClient();

    await expect(client.fetchQuery(systemStatusQueryOptions)).resolves.toEqual({
      version: 1,
      overall: "not_ready",
      developmentStorage: "not_ready",
    });
    client.clear();
  });

  it.each([
    [200, { version: 1, overall: "not_ready", developmentStorage: "not_ready" }],
    [503, { version: 1, overall: "ready", developmentStorage: "ready" }],
    [200, { version: 1, overall: "ready", developmentStorage: "ready", path: "/secret" }],
  ])("rejects status %d with a mismatched or malformed body", async (status, payload) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response(payload, status))));

    const error = await captureQueryError();

    expect(error).toBeInstanceOf(SystemStatusQueryError);
    expect(error.message).toBe(SYSTEM_STATUS_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("secret");
  });

  it("does not read or expose bodies for unsupported HTTP statuses", async () => {
    const readBody = vi.fn(() => Promise.resolve({ token: "body-secret" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ json: readBody, ok: false, status: 500 } as unknown as Response),
      ),
    );

    const error = await captureQueryError();

    expect(readBody).not.toHaveBeenCalled();
    expect(error.message).toBe(SYSTEM_STATUS_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("body-secret");
  });

  it("replaces network details with one safe error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("GET /api?token=secret failed at /private/path"))),
    );

    const error = await captureQueryError();

    expect(error).toBeInstanceOf(SystemStatusQueryError);
    expect(error.message).toBe(SYSTEM_STATUS_QUERY_ERROR_MESSAGE);
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("private");
    expect(error.cause).toBeUndefined();
  });
});
