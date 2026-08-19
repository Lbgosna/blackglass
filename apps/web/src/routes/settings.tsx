import {
  THEME_MEDIA_QUERY,
  cn,
  listenForSystemTheme,
  resolveTheme,
  useTheme,
  type ResolvedTheme,
  type ThemeFamily,
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

interface ThemeFamilyOption {
  darkLabel: string;
  label: string;
  lightLabel: string;
  value: ThemeFamily;
}

const themeOptions: ReadonlyArray<ThemeOption> = [
  { label: "System", description: "Follow this device's appearance.", value: "system" },
  { label: "Light", description: "Keep the workspace light.", value: "light" },
  { label: "Dark", description: "Keep the workspace dark.", value: "dark" },
];

const themeFamilies: ReadonlyArray<ThemeFamilyOption> = [
  { value: "smoked", label: "Smoked lime", darkLabel: "Smoked lime dark", lightLabel: "Smoked lime light" },
  { value: "void", label: "Void", darkLabel: "Void dark", lightLabel: "Void light" },
  { value: "instrument", label: "Instrument", darkLabel: "Instrument dark", lightLabel: "Instrument light" },
  { value: "grove", label: "Grove", darkLabel: "Grove dark", lightLabel: "Grove light" },
  { value: "ember", label: "Ember", darkLabel: "Ember dark", lightLabel: "Ember light" },
  { value: "iris", label: "Iris", darkLabel: "Iris dark", lightLabel: "Iris light" },
];

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

function SchemeControl() {
  const { preference, setPreference } = useTheme();
  const systemResolved = useSystemResolvedTheme();

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[13px] font-semibold text-foreground">Scheme</legend>
      <div className="appearance-scheme-options">
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
                  "flex h-full min-h-11 items-center rounded-[10px] border border-transparent bg-accent px-3 py-2 text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none md:min-h-8",
                  selected && "border-primary",
                )}
                data-selected={selected ? "true" : "false"}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold">{option.label}</span>
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
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ThemeFamilyGrid() {
  const { family, preference, setAppearance } = useTheme();
  const systemResolved = useSystemResolvedTheme();
  const resolvedScheme = preference === "system" ? systemResolved : preference;

  return (
    <div>
      <h3 className="m-0 text-[13px] font-semibold text-foreground">Themes</h3>
      <p className="mt-1 mb-3 text-[12px] leading-5 text-muted-foreground">
        Left bubble is dark. Right bubble is light.
      </p>
      <div className="appearance-theme-grid">
        {themeFamilies.map((option) => {
          const selected = family === option.value;
          return (
            <div
              key={option.value}
              className={cn(
                "rounded-xl bg-accent px-3.5 pt-4 pb-3 text-left text-accent-foreground",
                selected && "shadow-[inset_0_0_0_1px_var(--primary)]",
              )}
              data-selected={selected ? "true" : "false"}
              data-theme-family={option.value}
            >
              <div className="mb-4 flex gap-3.5">
                <button
                  type="button"
                  aria-label={option.darkLabel}
                  aria-pressed={selected && resolvedScheme === "dark"}
                  className="theme-orb shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-orb={`${option.value}-dark`}
                  data-on={selected && resolvedScheme === "dark" ? "true" : "false"}
                  onClick={() => setAppearance({ family: option.value, preference: "dark" })}
                />
                <button
                  type="button"
                  aria-label={option.lightLabel}
                  aria-pressed={selected && resolvedScheme === "light"}
                  className="theme-orb shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  data-orb={`${option.value}-light`}
                  data-on={selected && resolvedScheme === "light" ? "true" : "false"}
                  onClick={() => setAppearance({ family: option.value, preference: "light" })}
                />
              </div>
              <span className="text-[13px]">{option.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <main className="min-h-full bg-background px-4 py-5 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-4">
          <p className="m-0 text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
            Blackglass
          </p>
          <h1 className="mt-2 mb-0 text-[26px] leading-none font-semibold tracking-[-0.04em]">
            Settings
          </h1>
          <p className="mt-2 mb-0 max-w-xl text-[13px] leading-5 text-muted-foreground">
            Configure how Blackglass looks on this device.
          </p>
        </header>

        <section
          aria-labelledby="appearance-heading"
          className="appearance-settings text-foreground"
        >
          <h2 id="appearance-heading" className="m-0 text-[13px] font-semibold">
            Appearance
          </h2>
          <p className="mt-1 mb-4 max-w-xl text-[13px] leading-5 text-muted-foreground">
            Choose a theme family, then lock light or dark, or follow your system setting.
          </p>
          <div className="grid gap-5">
            <SchemeControl />
            <ThemeFamilyGrid />
          </div>
        </section>
      </div>
    </main>
  );
}
