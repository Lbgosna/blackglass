import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEME_STORAGE_KEY = "blackglass.theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

interface ThemeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ThemeRoot {
  classList: Pick<DOMTokenList, "add" | "remove">;
  dataset: DOMStringMap;
  style: Pick<CSSStyleDeclaration, "colorScheme">;
}

interface ThemeStorageEvents {
  addEventListener: (type: "storage", listener: (event: StorageEvent) => void) => void;
  removeEventListener: (type: "storage", listener: (event: StorageEvent) => void) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function parseThemePreference(value: unknown): ThemePreference | null {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export function readThemePreference(storage: ThemeStorage): ThemePreference {
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY)) ?? "system";
  } catch {
    return "system";
  }
}

export function storeThemePreference(storage: ThemeStorage, preference: ThemePreference): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme selection remains usable when storage is blocked or full.
  }
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function applyTheme(
  root: ThemeRoot,
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark);
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  return resolved;
}

export function listenForSystemTheme(
  mediaQuery: MediaQueryList,
  onChange: (prefersDark: boolean) => void,
): () => void {
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}

export function listenForThemeStorage(
  events: ThemeStorageEvents,
  onPreference: (preference: ThemePreference) => void,
): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (event.newValue === null) {
      onPreference("system");
      return;
    }
    const preference = parseThemePreference(event.newValue);
    if (preference) onPreference(preference);
  };
  events.addEventListener("storage", listener);
  return () => events.removeEventListener("storage", listener);
}

export function suppressThemeTransitions(root: ThemeRoot, schedule: (callback: () => void) => number) {
  root.classList.add("theme-switching");
  return schedule(() => schedule(() => root.classList.remove("theme-switching")));
}

export function initializeTheme(browserWindow: Window = window): ThemePreference {
  const preference = readThemePreference(browserWindow.localStorage);
  applyTheme(
    browserWindow.document.documentElement,
    preference,
    browserWindow.matchMedia(THEME_MEDIA_QUERY).matches,
  );
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readThemePreference(window.localStorage),
  );

  const changePreference = useCallback(
    (nextPreference: ThemePreference, persist: boolean) => {
      const root = document.documentElement;
      suppressThemeTransitions(root, window.requestAnimationFrame.bind(window));
      applyTheme(root, nextPreference, window.matchMedia(THEME_MEDIA_QUERY).matches);
      if (persist) storeThemePreference(window.localStorage, nextPreference);
      setPreferenceState(nextPreference);
    },
    [],
  );

  useEffect(() =>
    listenForThemeStorage(window, (nextPreference) => changePreference(nextPreference, false)),
  [changePreference]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    applyTheme(document.documentElement, preference, mediaQuery.matches);
    if (preference !== "system") return;

    return listenForSystemTheme(mediaQuery, (prefersDark) => {
      suppressThemeTransitions(document.documentElement, window.requestAnimationFrame.bind(window));
      applyTheme(document.documentElement, "system", prefersDark);
    });
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference(nextPreference) {
        changePreference(nextPreference, true);
      },
    }),
    [changePreference, preference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
