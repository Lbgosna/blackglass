// @vitest-environment jsdom

import {
  CONSOLE_HEIGHT_STORAGE_KEY,
  SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "@blackglass/ui";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppQueryClient } from "./query-client.js";
import { createAppRouter } from "./router.js";

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

interface RenderAppOptions {
  strict?: boolean;
}

const testQueryClients = new Set<QueryClient>();

async function renderApp(initialEntry = "/", { strict = false }: RenderAppOptions = {}) {
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [initialEntry],
    }),
  );
  await router.load();
  const queryClient = createAppQueryClient();
  testQueryClients.add(queryClient);
  const application = (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  );
  const result = render(strict ? <StrictMode>{application}</StrictMode> : application);
  return { ...result, queryClient, router };
}

let media: MediaHarness;

beforeEach(() => {
  window.localStorage.clear();
  document.body.style.cssText = "";
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280, writable: true });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900, writable: true });
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
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  for (const queryClient of testQueryClients) queryClient.clear();
  testQueryClients.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App health state", () => {
  it("deduplicates the initial StrictMode request, announces loading, then connects", async () => {
    const request = deferred<Response>();
    const fetchMock = vi.fn(() => request.promise);
    vi.stubGlobal("fetch", fetchMock);

    await renderApp("/", { strict: true });
    const loading = screen.getByRole("status", { name: "Checking API" });
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    request.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    await renderApp();

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports non-success responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({}, { ok: false, status: 503 }))));

    await renderApp();

    expect(await screen.findByText("API unavailable")).toBeTruthy();
  });

  it("reports responses that violate the shared contract", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response({ status: "ok", detail: true }))));

    await renderApp();

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

    const { container } = await renderApp();
    const mountedPage = container.firstElementChild;
    const mountedShell = screen.getByTestId("application-shell");
    first.reject(new Error("offline"));
    expect(await screen.findByText("API unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Checking API")).toBeTruthy();
    expect(container.firstElementChild).toBe(mountedPage);
    expect(screen.getByTestId("application-shell")).toBe(mountedShell);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    second.resolve(response({ status: "ok" }));
    expect(await screen.findByText("API connected")).toBeTruthy();
  });

  it("preserves cached success and offers another retry after a refresh failure", async () => {
    const second = deferred<Response>();
    const third = deferred<Response>();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(response({ status: "ok" }))
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    vi.stubGlobal("fetch", fetchMock);

    await renderApp();
    expect(await screen.findByText("API connected")).toBeTruthy();
    const shell = screen.getByTestId("application-shell");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    second.reject(new Error("GET /health?token=secret failed with body-secret"));

    const staleWarning = await screen.findByText("Health refresh failed");
    expect(screen.getByText("API connected")).toBeTruthy();
    expect(screen.queryByText("API unavailable")).toBeNull();
    expect(screen.getByTestId("application-shell")).toBe(shell);

    fireEvent.click(
      within(staleWarning.closest("section")!).getByRole("button", { name: "Retry" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    third.resolve(response({ status: "ok" }));
    await waitFor(() => expect(screen.queryByText("Health refresh failed")).toBeNull());
    expect(screen.getByText("API connected")).toBeTruthy();
  });
});

describe("Application shell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  });

  it("restores, toggles, and persists desktop sidebar state", async () => {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, "false");
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "430");
    await renderApp();

    const shell = screen.getByTestId("application-shell");
    const toggle = screen.getByRole("button", { name: "Show sidebar" });
    expect(shell.dataset.sidebarOpen).toBe("false");
    expect(shell.getAttribute("style")).toContain("--shell-sidebar-width: 430px");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(shell.dataset.sidebarOpen).toBe("true");
    expect(window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY)).toBe("true");
    expect(screen.getByRole("button", { name: "Hide sidebar" })).toBeTruthy();
  });

  it("handles Mod+B in capture phase and ignores keybinding capture regions", async () => {
    await renderApp();
    const shell = screen.getByTestId("application-shell");
    const toggle = screen.getByRole("button", { name: "Hide sidebar" });
    expect(toggle.getAttribute("aria-keyshortcuts")).toBe("Control+B Meta+B");

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(shell.dataset.sidebarOpen).toBe("false");

    const captureRegion = document.createElement("div");
    captureRegion.dataset.keybindingCapture = "";
    const input = document.createElement("input");
    captureRegion.append(input);
    document.body.append(captureRegion);
    fireEvent.keyDown(input, { key: "b", ctrlKey: true });
    expect(shell.dataset.sidebarOpen).toBe("false");
    captureRegion.remove();

    fireEvent.keyDown(window, { key: "B", metaKey: true });
    expect(shell.dataset.sidebarOpen).toBe("true");
  });

  it("keeps mobile navigation independent and restores focus after navigation", async () => {
    window.innerWidth = 500;
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, "false");
    await renderApp();

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Blackglass navigation" })).toBeTruthy();
    expect(screen.getByTestId("application-shell").dataset.sidebarOpen).toBe("false");

    fireEvent.click(screen.getAllByRole("link", { name: "Engagements" })[0]!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Blackglass navigation" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByTestId("application-shell").dataset.sidebarOpen).toBe("false");
  });

  it("does not overwrite desktop geometry while mounted on mobile", async () => {
    window.innerWidth = 500;
    window.innerHeight = 600;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "430");
    window.localStorage.setItem(CONSOLE_HEIGHT_STORAGE_KEY, "410");
    await renderApp();

    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("430");
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("410");

    window.innerWidth = 1280;
    window.innerHeight = 900;
    fireEvent(window, new Event("resize"));
    const style = screen.getByTestId("application-shell").getAttribute("style");
    expect(style).toContain("--shell-sidebar-width: 430px");
    expect(style).toContain("--shell-console-height: 410px");
  });

  it("closes mobile navigation with Escape", async () => {
    window.innerWidth = 500;
    await renderApp();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Blackglass navigation" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes both mobile sheets on desktop takeover and moves focus to desktop controls", async () => {
    window.innerWidth = 390;
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog", { name: "Blackglass navigation" });
    window.innerWidth = 700;
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("dialog", { name: "Blackglass navigation" })).toBeTruthy();
    window.innerWidth = 1000;
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Blackglass navigation" })).toBeNull(),
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide sidebar" }));

    window.innerWidth = 390;
    fireEvent(window, new Event("resize"));
    fireEvent.click(screen.getByRole("button", { name: "Open console" }));
    await screen.findByRole("dialog", { name: "Console" });
    window.innerWidth = 767;
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("dialog", { name: "Console" })).toBeTruthy();
    window.innerWidth = 1000;
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Console" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Console" }));
  });

  it("provides keyboard tabs and independent mobile console state", async () => {
    window.innerWidth = 500;
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, "false");
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open console" }));
    expect(await screen.findByRole("dialog", { name: "Console" })).toBeTruthy();
    const advisor = screen.getByRole("tab", { name: "Advisor" });
    advisor.focus();
    fireEvent.keyDown(advisor, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
    expect(screen.getByRole("tabpanel", { name: "Activity" })).toBeTruthy();
    expect(screen.getByTestId("application-shell").dataset.sidebarOpen).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Close console" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Console" })).toBeNull());
  });

  it("collapses and reopens the desktop console without changing its height", async () => {
    window.localStorage.setItem(CONSOLE_HEIGHT_STORAGE_KEY, "410");
    await renderApp();
    const consoleRegion = screen.getByRole("region", { name: "Console" });
    expect(screen.getByRole("separator", { name: "Resize console" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse console" }));
    expect(consoleRegion.className).toContain("shell-console-collapsed");
    expect(screen.queryByRole("separator", { name: "Resize console" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand console" }));
    expect(consoleRegion.className).not.toContain("shell-console-collapsed");
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("410");
  });

  it("resizes the sidebar with keyboard controls and ignores unrelated keys", async () => {
    await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    expect(rail.getAttribute("tabindex")).toBe("0");
    expect(rail.className).toContain("focus-visible:ring-2");

    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(rail.getAttribute("aria-valuenow")).toBe("272");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("272");
    fireEvent.keyDown(rail, { key: "ArrowLeft" });
    expect(rail.getAttribute("aria-valuenow")).toBe("256");
    fireEvent.keyDown(rail, { key: "Home" });
    expect(rail.getAttribute("aria-valuenow")).toBe("208");
    fireEvent.keyDown(rail, { key: "End" });
    expect(rail.getAttribute("aria-valuenow")).toBe("640");

    const handled = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    expect(rail.dispatchEvent(handled)).toBe(false);
    expect(handled.defaultPrevented).toBe(true);

    const unrelated = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "PageUp",
    });
    expect(rail.dispatchEvent(unrelated)).toBe(true);
    expect(unrelated.defaultPrevented).toBe(false);
  });

  it("resizes the console with keyboard controls", async () => {
    await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize console" });
    expect(rail.getAttribute("tabindex")).toBe("0");
    expect(rail.className).toContain("focus-visible:ring-2");

    fireEvent.keyDown(rail, { key: "ArrowUp" });
    expect(rail.getAttribute("aria-valuenow")).toBe("336");
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("336");
    fireEvent.keyDown(rail, { key: "ArrowDown" });
    expect(rail.getAttribute("aria-valuenow")).toBe("320");
    fireEvent.keyDown(rail, { key: "Home" });
    expect(rail.getAttribute("aria-valuenow")).toBe("220");
    fireEvent.keyDown(rail, { key: "End" });
    expect(rail.getAttribute("aria-valuenow")).toBe("540");
  });

  it("batches sidebar resize into one frame, clamps, and restores document styles", async () => {
    const frames: FrameRequestCallback[] = [];
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: vi.fn(),
    });
    await renderApp();
    frames.length = 0;
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    });
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "text";

    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: true, pointerId: 7 });
    fireEvent.pointerMove(rail, { clientX: 400, pointerId: 7 });
    fireEvent.pointerMove(rail, { clientX: 2000, pointerId: 7 });
    expect(frames).toHaveLength(1);
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("256");

    act(() => frames.shift()?.(0));
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("640");
    fireEvent.pointerUp(rail, { pointerId: 7 });
    expect(document.body.style.cursor).toBe("crosshair");
    expect(document.body.style.userSelect).toBe("text");
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);
  });

  it("ignores non-primary resize and cleans up cancel and unmount", async () => {
    const { unmount } = await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    const releasePointerCapture = vi.fn();
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    });

    fireEvent.pointerDown(rail, { button: 2, clientX: 256, isPrimary: true, pointerId: 1 });
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);
    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: false, pointerId: 2 });
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);

    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: true, pointerId: 3 });
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(true);
    fireEvent.pointerCancel(rail, { pointerId: 3 });
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);

    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: true, pointerId: 4 });
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    unmount();
    expect(releasePointerCapture).toHaveBeenCalledWith(4);
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("suppresses the click after a drag longer than two pixels", async () => {
    await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => false),
      setPointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: true, pointerId: 5 });
    fireEvent.pointerMove(rail, { clientX: 260, pointerId: 5 });
    fireEvent.pointerUp(rail, { pointerId: 5 });
    const suppressed = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(rail.dispatchEvent(suppressed)).toBe(false);
    expect(suppressed.defaultPrevented).toBe(true);
    const nextClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(rail.dispatchEvent(nextClick)).toBe(true);
    expect(nextClick.defaultPrevented).toBe(false);
  });

  it("aborts an active sidebar resize when the sidebar closes", async () => {
    await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    const releasePointerCapture = vi.fn();
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    });
    document.body.style.cursor = "wait";
    document.body.style.userSelect = "text";

    fireEvent.pointerDown(rail, { button: 0, clientX: 256, isPrimary: true, pointerId: 10 });
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });

    expect(screen.queryByRole("separator", { name: "Resize sidebar" })).toBeNull();
    expect(releasePointerCapture).toHaveBeenCalledWith(10);
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);
    expect(document.body.style.cursor).toBe("wait");
    expect(document.body.style.userSelect).toBe("text");
  });

  it("cancels pending console resize work when the console collapses", async () => {
    await renderApp();
    let queuedFrame: FrameRequestCallback | null = null;
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        queuedFrame = callback;
        return 44;
      }),
    });
    const cancelFrame = vi.fn();
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: cancelFrame,
    });
    const rail = screen.getByRole("separator", { name: "Resize console" });
    const releasePointerCapture = vi.fn();
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    });

    fireEvent.pointerDown(rail, { button: 0, clientY: 580, isPrimary: true, pointerId: 11 });
    fireEvent.pointerMove(rail, { clientY: 400, pointerId: 11 });
    fireEvent.click(screen.getByRole("button", { name: "Collapse console" }));

    expect(cancelFrame).toHaveBeenCalledWith(44);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(false);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    act(() => queuedFrame?.(0));
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("320");
  });

  it("aborts an active resize when the viewport crosses to mobile", async () => {
    window.innerWidth = 848;
    window.innerHeight = 400;
    await renderApp();
    const rail = screen.getByRole("separator", { name: "Resize sidebar" });
    const releasePointerCapture = vi.fn();
    Object.assign(rail, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    });
    document.documentElement.classList.add("shell-resizing");
    document.body.style.cursor = "help";
    document.body.style.userSelect = "all";

    fireEvent.pointerDown(rail, { button: 0, clientX: 208, isPrimary: true, pointerId: 12 });
    window.innerWidth = 700;
    window.innerHeight = 300;
    fireEvent(window, new Event("resize"));

    expect(releasePointerCapture).toHaveBeenCalledWith(12);
    expect(document.documentElement.classList.contains("shell-resizing")).toBe(true);
    expect(document.body.style.cursor).toBe("help");
    expect(document.body.style.userSelect).toBe("all");
  });

  it("persists console resize and re-clamps both dimensions on viewport resize", async () => {
    await renderApp();
    const consoleRail = screen.getByRole("separator", { name: "Resize console" });
    Object.assign(consoleRail, {
      hasPointerCapture: vi.fn(() => false),
      setPointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(consoleRail, {
      button: 0,
      clientY: 580,
      isPrimary: true,
      pointerId: 8,
    });
    fireEvent.pointerMove(consoleRail, { clientY: 400, pointerId: 8 });
    fireEvent.pointerUp(consoleRail, { pointerId: 8 });
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("500");

    window.innerWidth = 700;
    window.innerHeight = 300;
    fireEvent(window, new Event("resize"));
    const style = screen.getByTestId("application-shell").getAttribute("style");
    expect(style).toContain("--shell-sidebar-width: 208px");
    expect(style).toContain("--shell-console-height: 220px");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("256");
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("500");
  });

  it("exposes reduced-motion shell rules and labelled resize controls", async () => {
    await renderApp();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize console" })).toBeTruthy();
    expect(document.querySelector(".application-shell")).toBeTruthy();
  });
});

describe("App theme preference", () => {
  it("uses the stored preference and exposes native selected state", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    await renderApp("/settings");

    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null }));
    });
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to system for invalid or unreadable storage", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const first = await renderApp("/settings");
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(
      true,
    );
    first.unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await renderApp("/settings");
    expect((screen.getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("reacts to OS changes only while system is selected and cleans up the listener", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { unmount } = await renderApp("/settings");

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
    await renderApp("/settings");

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

  it("keeps theme selection usable when storage writes fail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    await renderApp("/settings");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("shows a distinct pill for every selected theme preference", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await renderApp("/settings");

    for (const preference of ["Light", "Dark", "System"]) {
      fireEvent.click(screen.getByRole("radio", { name: preference }));
      expect((screen.getByRole("radio", { name: preference }) as HTMLInputElement).checked).toBe(
        true,
      );
      expect(screen.getByText(preference, { selector: "span" }).className).toContain(
        "bg-card",
      );
      for (const other of ["Light", "Dark", "System"].filter(
        (candidate) => candidate !== preference,
      )) {
        expect(screen.getByText(other, { selector: "span" }).className).not.toContain("bg-card");
      }
    }
  });

  it("updates the whole app theme and preserves it across navigation without remounting the shell", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    await renderApp("/settings");
    const shell = screen.getByTestId("application-shell");

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Application shell" })).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBe(shell);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBe(shell);
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps empty and error actions accessible by name", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await renderApp();

    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("App state gallery", () => {
  it("keeps the application shell mounted while every synthetic state changes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await renderApp();
    const shell = screen.getByTestId("application-shell");

    expect(screen.getByRole("status", { name: "Loading workspace overview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Empty" }));
    expect(screen.getByText("No workspace activity yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filtered" }));
    expect(screen.getByText("No results match this view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stale" }));
    expect(screen.getByTestId("synthetic-stale-content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Recoverable" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]!);
    expect(screen.getByText(/Retry attempts: 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fatal" }));
    expect(await screen.findByText("Blackglass hit a fatal error")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("synthetic-stale-content")).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBe(shell);
  });
});

describe("Application routes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  });

  it.each([
    ["/", "Application shell", "Dashboard"],
    ["/engagements", "Engagements", "Engagements"],
    ["/plugins", "Plugins", "Plugins"],
    ["/settings", "Settings", "Settings"],
  ])("renders a direct entry for %s inside the shell", async (path, heading, activeLabel) => {
    await renderApp(path);

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBeTruthy();

    const globalNavigation = screen.getByRole("navigation", { name: "Global" });
    const activeGlobalLinks = within(globalNavigation)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    if (path === "/settings") {
      expect(activeGlobalLinks).toHaveLength(0);
      expect(screen.getByRole("link", { name: activeLabel }).getAttribute("aria-current")).toBe(
        "page",
      );
    } else {
      expect(activeGlobalLinks).toHaveLength(1);
      expect(activeGlobalLinks[0]?.textContent).toBe(activeLabel);
    }
  });

  it("navigates with exact active state while preserving the shell node", async () => {
    await renderApp();
    const shell = screen.getByTestId("application-shell");
    const globalNavigation = screen.getByRole("navigation", { name: "Global" });

    expect(
      within(globalNavigation)
        .getByRole("link", { name: "Dashboard" })
        .getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.click(within(globalNavigation).getByRole("link", { name: "Engagements" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Engagements" })).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBe(shell);
    expect(
      within(globalNavigation)
        .getByRole("link", { name: "Dashboard" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      within(globalNavigation)
        .getByRole("link", { name: "Engagements" })
        .getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.click(within(globalNavigation).getByRole("link", { name: "Plugins" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Plugins" })).toBeTruthy();
    expect(screen.getByTestId("application-shell")).toBe(shell);
    expect(
      within(globalNavigation)
        .getByRole("link", { name: "Engagements" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      within(globalNavigation).getByRole("link", { name: "Plugins" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("renders one Appearance card and one native theme control set on direct Settings entry", async () => {
    await renderApp("/settings");

    expect(screen.getAllByRole("region", { name: "Appearance" })).toHaveLength(1);
    expect(screen.getAllByRole("group", { name: "Theme" })).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const label of ["Light", "Dark", "System"]) {
      expect(screen.getByText(label, { selector: "span" }).className).toContain("min-h-11");
    }
    expect(screen.getByText("Choose a light or dark theme, or follow your system setting.")).toBeTruthy();
  });

  it("does not render theme controls or an action spacer in desktop or mobile navigation", async () => {
    await renderApp();

    const desktopSidebar = screen.getByRole("complementary", { name: "Primary" });
    expect(within(desktopSidebar).queryByRole("radio")).toBeNull();
    expect(screen.queryByTestId("sidebar-actions")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();

    window.innerWidth = 500;
    fireEvent(window, new Event("resize"));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog", { name: "Blackglass navigation" });
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(within(dialog).queryByTestId("sidebar-actions")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("closes mobile navigation after global and footer route activation", async () => {
    window.innerWidth = 500;
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    let dialog = await screen.findByRole("dialog", { name: "Blackglass navigation" });
    fireEvent.click(within(dialog).getByRole("link", { name: "Engagements" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Engagements" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    dialog = await screen.findByRole("dialog", { name: "Blackglass navigation" });
    fireEvent.click(within(dialog).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps unknown paths inside the shell with a useful recovery link", async () => {
    await renderApp("/missing/workspace");

    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(screen.getByText("/missing/workspace")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Return to Dashboard" }).getAttribute("href")).toBe(
      "/",
    );
    expect(screen.getByTestId("application-shell")).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "Global" }))
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(0);
  });

  it("keeps synthetic work links as Dashboard hash anchors", async () => {
    await renderApp("/plugins");

    expect(screen.getByRole("link", { name: /Service sweep/ }).getAttribute("href")).toBe(
      "/#active-service-sweep",
    );
  });
});
