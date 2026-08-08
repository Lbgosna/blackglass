// @vitest-environment jsdom

import {
  CONSOLE_HEIGHT_STORAGE_KEY,
  SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeProvider,
} from "@blackglass/ui";
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
    const mountedShell = screen.getByTestId("application-shell");
    first.reject(new Error("offline"));
    expect(await screen.findByText("API unavailable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Checking API")).toBeTruthy();
    expect(container.firstElementChild).toBe(mountedPage);
    expect(screen.getByTestId("application-shell")).toBe(mountedShell);
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

describe("Application shell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  });

  it("restores, toggles, and persists desktop sidebar state", () => {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, "false");
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "430");
    renderApp();

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

  it("handles Mod+B in capture phase and ignores keybinding capture regions", () => {
    renderApp();
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
    renderApp();

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

  it("does not overwrite desktop geometry while mounted on mobile", () => {
    window.innerWidth = 500;
    window.innerHeight = 600;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "430");
    window.localStorage.setItem(CONSOLE_HEIGHT_STORAGE_KEY, "410");
    renderApp();

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
    renderApp();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Blackglass navigation" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes both mobile sheets on desktop takeover and moves focus to desktop controls", async () => {
    window.innerWidth = 390;
    renderApp();

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
    renderApp();

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

  it("collapses and reopens the desktop console without changing its height", () => {
    window.localStorage.setItem(CONSOLE_HEIGHT_STORAGE_KEY, "410");
    renderApp();
    const consoleRegion = screen.getByRole("region", { name: "Console" });
    expect(screen.getByRole("separator", { name: "Resize console" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse console" }));
    expect(consoleRegion.className).toContain("shell-console-collapsed");
    expect(screen.queryByRole("separator", { name: "Resize console" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand console" }));
    expect(consoleRegion.className).not.toContain("shell-console-collapsed");
    expect(window.localStorage.getItem(CONSOLE_HEIGHT_STORAGE_KEY)).toBe("410");
  });

  it("resizes the sidebar with keyboard controls and ignores unrelated keys", () => {
    renderApp();
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

  it("resizes the console with keyboard controls", () => {
    renderApp();
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

  it("batches sidebar resize into one frame, clamps, and restores document styles", () => {
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
    renderApp();
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

  it("ignores non-primary resize and cleans up cancel and unmount", () => {
    const { unmount } = renderApp();
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

  it("suppresses the click after a drag longer than two pixels", () => {
    renderApp();
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

  it("aborts an active sidebar resize when the sidebar closes", () => {
    renderApp();
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

  it("cancels pending console resize work when the console collapses", () => {
    renderApp();
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

  it("aborts an active resize when the viewport crosses to mobile", () => {
    window.innerWidth = 848;
    window.innerHeight = 400;
    renderApp();
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

  it("persists console resize and re-clamps both dimensions on viewport resize", () => {
    renderApp();
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

  it("exposes reduced-motion shell rules and labelled resize controls", () => {
    renderApp();
    expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize console" })).toBeTruthy();
    expect(document.querySelector(".application-shell")).toBeTruthy();
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
