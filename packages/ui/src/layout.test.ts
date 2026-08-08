import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CONSOLE_HEIGHT,
  DEFAULT_SIDEBAR_WIDTH,
  clampConsoleHeight,
  clampSidebarWidth,
  getLayoutStorage,
  parseStoredBoolean,
  parseStoredNumber,
  readStoredBoolean,
  readStoredNumber,
  writeStoredValue,
} from "./layout.js";

describe("layout storage", () => {
  it("parses only finite numbers and exact booleans", () => {
    expect(parseStoredNumber("312.5")).toBe(312.5);
    expect(parseStoredNumber(312)).toBeNull();
    expect(parseStoredNumber("")).toBeNull();
    expect(parseStoredNumber("Infinity")).toBeNull();
    expect(parseStoredNumber("width")).toBeNull();
    expect(parseStoredBoolean("true")).toBe(true);
    expect(parseStoredBoolean("false")).toBe(false);
    expect(parseStoredBoolean("TRUE")).toBeNull();
  });

  it("uses defaults for missing, malformed, and unreadable storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    expect(readStoredNumber(storage, "width", DEFAULT_SIDEBAR_WIDTH)).toBe(256);
    expect(readStoredBoolean(storage, "open", true)).toBe(true);

    values.set("width", "wide");
    values.set("open", "yes");
    expect(readStoredNumber(storage, "width", DEFAULT_SIDEBAR_WIDTH)).toBe(256);
    expect(readStoredBoolean(storage, "open", true)).toBe(true);

    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
    };
    expect(readStoredNumber(blocked, "width", DEFAULT_SIDEBAR_WIDTH)).toBe(256);
    expect(readStoredBoolean(blocked, "open", false)).toBe(false);
    expect(readStoredNumber(null, "width", DEFAULT_SIDEBAR_WIDTH)).toBe(256);
    expect(readStoredBoolean(null, "open", true)).toBe(true);
  });

  it("handles an unavailable localStorage property", () => {
    const source = Object.defineProperty({}, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
    expect(getLayoutStorage(source as { readonly localStorage: Storage })).toBeNull();
  });

  it("keeps writes best-effort", () => {
    const setItem = vi.fn();
    writeStoredValue({ setItem }, "width", 300);
    expect(setItem).toHaveBeenCalledWith("width", "300");

    expect(() =>
      writeStoredValue(
        {
          setItem() {
            throw new Error("full");
          },
        },
        "open",
        false,
      ),
    ).not.toThrow();
  });
});

describe("layout clamping", () => {
  it("clamps sidebar widths at normal and narrow viewport sizes", () => {
    expect(clampSidebarWidth(100, 1440)).toBe(208);
    expect(clampSidebarWidth(400, 1440)).toBe(400);
    expect(clampSidebarWidth(900, 1440)).toBe(800);
    expect(clampSidebarWidth(500, 700)).toBe(208);
    expect(clampSidebarWidth(Number.NaN, 1440)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("clamps console heights at normal and impossible viewport sizes", () => {
    expect(clampConsoleHeight(100, 1000)).toBe(220);
    expect(clampConsoleHeight(500, 1000)).toBe(500);
    expect(clampConsoleHeight(900, 1000)).toBe(600);
    expect(clampConsoleHeight(320, 300)).toBe(220);
    expect(clampConsoleHeight(Number.NaN, 1000)).toBe(DEFAULT_CONSOLE_HEIGHT);
  });
});
