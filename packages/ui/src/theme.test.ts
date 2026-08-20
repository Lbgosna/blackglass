import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_THEME_FAMILY,
  THEME_FAMILIES,
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyTheme,
  listenForSystemTheme,
  listenForThemeFamilyStorage,
  listenForThemeStorage,
  parseThemeFamily,
  parseThemePreference,
  readThemeFamily,
  readThemePreference,
  resolveTheme,
  storeThemeFamily,
  storeThemePreference,
  suppressThemeTransitions,
} from "./theme.js";

describe("theme preferences", () => {
  it("accepts only the supported preference strings", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("sepia")).toBeNull();
    expect(parseThemePreference(null)).toBeNull();
  });

  it("falls back to system when storage is missing, invalid, or unavailable", () => {
    expect(readThemePreference({ getItem: () => null, setItem: vi.fn() })).toBe("system");
    expect(readThemePreference({ getItem: () => "sepia", setItem: vi.fn() })).toBe("system");
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: vi.fn(),
      }),
    ).toBe("system");
  });

  it("keeps selection usable when storage writes fail", () => {
    expect(() =>
      storeThemePreference(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error("full");
          },
        },
        "dark",
      ),
    ).not.toThrow();
  });

  it("resolves and applies explicit and system themes", () => {
    const root = {
      classList: { add: vi.fn(), remove: vi.fn() },
      dataset: {} as DOMStringMap,
      style: { colorScheme: "" },
    };

    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(applyTheme(root, "light", true)).toBe("light");
    expect(root.dataset).toEqual({
      theme: "light",
      themeFamily: DEFAULT_THEME_FAMILY,
      themePreference: "light",
    });
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("theme families", () => {
  it("accepts only the six mock families and defaults to smoked", () => {
    expect(THEME_FAMILIES).toEqual(["smoked", "void", "instrument", "grove", "ember", "iris"]);
    expect(parseThemeFamily("void")).toBe("void");
    expect(parseThemeFamily("iris")).toBe("iris");
    expect(parseThemeFamily("mint")).toBeNull();
    expect(parseThemeFamily("dark")).toBeNull();
    expect(parseThemeFamily(null)).toBeNull();
    expect(readThemeFamily({ getItem: () => null, setItem: vi.fn() })).toBe("smoked");
    expect(readThemeFamily({ getItem: () => "sepia", setItem: vi.fn() })).toBe("smoked");
    expect(
      readThemeFamily({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: vi.fn(),
      }),
    ).toBe("smoked");
  });

  it("applies family independently of light and dark", () => {
    const root = {
      classList: { add: vi.fn(), remove: vi.fn() },
      dataset: {} as DOMStringMap,
      style: { colorScheme: "" },
    };

    expect(applyTheme(root, "dark", false, "ember")).toBe("dark");
    expect(root.dataset).toEqual({
      theme: "dark",
      themeFamily: "ember",
      themePreference: "dark",
    });
    expect(applyTheme(root, "system", false, "grove")).toBe("light");
    expect(root.dataset.themeFamily).toBe("grove");
    expect(root.dataset.theme).toBe("light");
  });

  it("keeps family selection usable when storage writes fail", () => {
    expect(() =>
      storeThemeFamily(
        {
          getItem: vi.fn(),
          setItem: () => {
            throw new Error("full");
          },
        },
        "void",
      ),
    ).not.toThrow();
  });
});

describe("theme synchronization", () => {
  it("subscribes to system changes and removes the same listener", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      addEventListener: vi.fn((_type: "change", next: (event: MediaQueryListEvent) => void) => {
        listener = next;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    const onChange = vi.fn();

    const cleanup = listenForSystemTheme(mediaQuery, onChange);
    listener?.({ matches: true } as MediaQueryListEvent);
    expect(onChange).toHaveBeenCalledWith(true);

    cleanup();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("accepts valid cross-tab preferences, ignores malformed values, and cleans up", () => {
    let listener: ((event: StorageEvent) => void) | undefined;
    const events = {
      addEventListener: vi.fn((_type: "storage", next: (event: StorageEvent) => void) => {
        listener = next;
      }),
      removeEventListener: vi.fn(),
    };
    const onPreference = vi.fn();

    const cleanup = listenForThemeStorage(events, onPreference);
    listener?.({ key: THEME_STORAGE_KEY, newValue: "midnight" } as StorageEvent);
    listener?.({ key: "unrelated", newValue: "dark" } as StorageEvent);
    expect(onPreference).not.toHaveBeenCalled();

    listener?.({ key: THEME_STORAGE_KEY, newValue: "dark" } as StorageEvent);
    expect(onPreference).toHaveBeenCalledWith("dark");

    listener?.({ key: THEME_STORAGE_KEY, newValue: null } as StorageEvent);
    listener?.({ key: null, newValue: null } as StorageEvent);
    expect(onPreference).toHaveBeenNthCalledWith(2, "system");
    expect(onPreference).toHaveBeenNthCalledWith(3, "system");

    cleanup();
    expect(events.removeEventListener).toHaveBeenCalledWith("storage", listener);
  });

  it("accepts valid cross-tab families, ignores malformed values, and resets to smoked", () => {
    let listener: ((event: StorageEvent) => void) | undefined;
    const events = {
      addEventListener: vi.fn((_type: "storage", next: (event: StorageEvent) => void) => {
        listener = next;
      }),
      removeEventListener: vi.fn(),
    };
    const onFamily = vi.fn();

    const cleanup = listenForThemeFamilyStorage(events, onFamily);
    listener?.({ key: THEME_FAMILY_STORAGE_KEY, newValue: "mint" } as StorageEvent);
    listener?.({ key: THEME_STORAGE_KEY, newValue: "void" } as StorageEvent);
    expect(onFamily).not.toHaveBeenCalled();

    listener?.({ key: THEME_FAMILY_STORAGE_KEY, newValue: "iris" } as StorageEvent);
    expect(onFamily).toHaveBeenCalledWith("iris");

    listener?.({ key: THEME_FAMILY_STORAGE_KEY, newValue: null } as StorageEvent);
    listener?.({ key: null, newValue: null } as StorageEvent);
    expect(onFamily).toHaveBeenNthCalledWith(2, "smoked");
    expect(onFamily).toHaveBeenNthCalledWith(3, "smoked");

    cleanup();
    expect(events.removeEventListener).toHaveBeenCalledWith("storage", listener);
  });

  it("keeps transitions suppressed through one rendered frame", () => {
    const callbacks: Array<() => void> = [];
    const root = {
      classList: { add: vi.fn(), remove: vi.fn() },
      dataset: {} as DOMStringMap,
      style: { colorScheme: "" },
    };

    suppressThemeTransitions(root, (callback) => callbacks.push(callback));
    expect(root.classList.add).toHaveBeenCalledWith("theme-switching");
    expect(callbacks).toHaveLength(1);

    callbacks.shift()?.();
    expect(root.classList.remove).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    callbacks.shift()?.();
    expect(root.classList.remove).toHaveBeenCalledWith("theme-switching");
  });
});
