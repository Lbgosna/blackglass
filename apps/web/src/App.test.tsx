// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (reason?: unknown) => void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function response(payload: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  return {
    json: async () => payload,
    ok: options.ok ?? true,
    status: options.status ?? 200,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App health state", () => {
  it("stays checking while the request is pending, then connects", async () => {
    const request = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => request.promise));

    render(<App />);
    expect(screen.getByText("Checking API")).toBeTruthy();

    request.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    render(<App />);

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports non-success responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({}, { ok: false, status: 503 }))));

    render(<App />);

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports responses that violate the shared contract", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({ status: "ok", detail: true }))));

    render(<App />);

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("retries in the mounted page and accepts a later success", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);
    const mountedPage = container.firstElementChild;
    first.reject(new Error("offline"));
    expect(await screen.findByText("API unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Checking API")).toBeTruthy();
    expect(container.firstElementChild).toBe(mountedPage);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    second.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();
  });
});
