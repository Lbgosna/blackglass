// @vitest-environment jsdom

import { THEME_STORAGE_KEY, ThemeProvider } from "@blackglass/ui";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App.js";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (reason?: unknown) => void;
}

interface MediaHarness {
  dispatch: (matches: boolean) => void;
  mediaQuery: MediaQueryList;
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

function createMediaHarness(initialMatches = false): MediaHarness {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_type: "change", listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn(
      (_type: "change", listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    mediaQuery,
    dispatch(nextMatches) {
      matches = nextMatches;
      const event = { matches } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

let media: MediaHarness;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  media = createMediaHarness();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => media.mediaQuery),
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App health state", () => {
  it("exposes a stable polite loading status, then connects", async () => {
    const request = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => request.promise));

    renderApp();
    const loading = screen.getByRole("status", { name: "Checking API" });
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");

    request.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    renderApp();

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports non-success responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({}, { ok: false, status: 503 }))));

    renderApp();

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports responses that violate the shared contract", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({ status: "ok", detail: true }))));

    renderApp();

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

    const { container } = renderApp();
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

  it("ignores a stale response after a newer health request completes", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    vi.stubGlobal("fetch", fetchMock);

    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    second.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();

    first.reject(new Error("late failure"));
    await waitFor(() => expect(screen.getByText("API connected")).toBeTruthy());
  });
});

describe("App theme preference", () => {
  it("uses the stored preference and exposes native selected state", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderApp();

    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null }));
    });
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to system for invalid or unreadable storage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const first = renderApp();
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(
      true,
    );
    first.unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderApp();
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("reacts to OS changes only while system is selected and cleans up the listener", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { unmount } = renderApp();

    act(() => media.dispatch(true));
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => media.dispatch(false));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(media.mediaQuery.removeEventListener).toHaveBeenCalled();

    unmount();
  });

  it("synchronizes valid storage events and ignores malformed values", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderApp();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }),
      );
    });
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "midnight" }),
      );
    });
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps theme selection usable when storage writes fail", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    renderApp();

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps empty and error actions accessible by name", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    renderApp();

    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
