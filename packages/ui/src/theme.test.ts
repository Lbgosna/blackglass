import { describe, expect, it, vi } from "vitest";

import {
  THEME_STORAGE_KEY,
  applyTheme,
  listenForSystemTheme,
  listenForThemeStorage,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
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
    expect(root.dataset).toEqual({ theme: "light", themePreference: "light" });
    expect(root.style.colorScheme).toBe("light");
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

    cleanup();
    expect(events.removeEventListener).toHaveBeenCalledWith("storage", listener);
  });
});
