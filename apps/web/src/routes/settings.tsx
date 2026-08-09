import {
  THEME_MEDIA_QUERY,
  cn,
  listenForSystemTheme,
  resolveTheme,
  useTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@blackglass/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

interface ThemeOption {
  description: string;
  label: string;
  value: ThemePreference;
}

const themeOptions: ReadonlyArray<ThemeOption> = [
  { label: "System", description: "Follow this device's appearance.", value: "system" },
  { label: "Light", description: "Keep the workspace light.", value: "light" },
  { label: "Dark", description: "Keep the workspace dark.", value: "dark" },
];

function ThemeMiniature({ theme }: { theme: ThemePreference }) {
  return (
    <span
      aria-hidden="true"
      className="appearance-preview relative block h-28 overflow-hidden rounded-lg border"
      data-preview-theme={theme}
    >
      <span className="appearance-preview-sidebar absolute inset-y-0 left-0 w-[29%] border-r p-2">
        <span className="appearance-preview-brand mb-3 block h-1.5 w-8 rounded-full" />
        <span className="appearance-preview-sidebar-line mb-1.5 block h-1.5 w-full rounded-full" />
        <span className="appearance-preview-sidebar-line block h-1.5 w-4/5 rounded-full" />
      </span>
      <span className="appearance-preview-workspace absolute inset-y-0 right-0 w-[71%] p-2.5">
        <span className="appearance-preview-heading mb-2 block h-2 w-1/2 rounded-full" />
        <span className="appearance-preview-surface block rounded-md border p-2">
          <span className="appearance-preview-copy mb-1.5 block h-1.5 w-4/5 rounded-full" />
          <span className="appearance-preview-copy block h-1.5 w-3/5 rounded-full" />
          <span className="mt-3 flex items-center justify-between gap-2">
            <span className="appearance-preview-status flex items-center gap-1">
              <span className="block size-1.5 rounded-full" />
              <span className="block h-1.5 w-5 rounded-full" />
            </span>
            <span className="appearance-preview-action block h-4 w-9 rounded-sm" />
          </span>
        </span>
      </span>
    </span>
  );
}

function useSystemResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolveTheme("system", window.matchMedia(THEME_MEDIA_QUERY).matches),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    setResolved(resolveTheme("system", mediaQuery.matches));
    return listenForSystemTheme(mediaQuery, (prefersDark) =>
      setResolved(resolveTheme("system", prefersDark)),
    );
  }, []);

  return resolved;
}

function ThemeControl() {
  const { preference, setPreference } = useTheme();
  const systemResolved = useSystemResolvedTheme();

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">
        Theme
      </legend>
      <div className="appearance-theme-options grid gap-3">
        {themeOptions.map((option) => {
          const selected = preference === option.value;
          const descriptionId = `theme-${option.value}-description`;

          return (
            <label key={option.value} className="relative block min-h-11 cursor-pointer">
              <input
                aria-describedby={descriptionId}
                aria-label={option.label}
                className="peer sr-only"
                type="radio"
                name="theme"
                value={option.value}
                checked={selected}
                onChange={() => setPreference(option.value)}
              />
              <span
                className={cn(
                  "block h-full rounded-xl border border-border bg-background p-2.5 text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card motion-reduce:transition-none",
                  selected && "border-primary bg-accent/40 shadow-sm ring-1 ring-primary",
                )}
                data-selected={selected ? "true" : "false"}
              >
                <ThemeMiniature theme={option.value} />
                <span className="flex min-h-11 items-center gap-2 px-1 pt-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-black",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card",
                    )}
                  >
                    {selected ? "✓" : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="text-sm font-bold">{option.label}</span>
                      {selected ? (
                        <span className="text-[10px] font-extrabold tracking-wider text-foreground uppercase">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <span
                      id={descriptionId}
                      className="mt-0.5 block text-xs leading-4 text-muted-foreground"
                    >
                      {option.value === "system"
                        ? `Currently ${systemResolved}`
                        : option.description}
                    </span>
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SettingsPage() {
  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8">
          <p className="m-0 text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
            Blackglass
          </p>
          <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
            Settings
          </h1>
          <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
            Configure how Blackglass looks on this device.
          </p>
        </header>

        <section
          aria-labelledby="appearance-heading"
          className="appearance-settings rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
        >
          <h2 id="appearance-heading" className="m-0 text-lg font-bold">
            Appearance
          </h2>
          <p className="mt-2 mb-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Choose a light or dark theme, or follow your system setting.
          </p>
          <ThemeControl />
        </section>
      </div>
    </main>
  );
}
