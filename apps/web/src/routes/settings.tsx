import { cn, useTheme, type ThemePreference } from "@blackglass/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const themeOptions: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
        Theme
      </legend>
      <div className="grid max-w-sm grid-cols-3 rounded-lg border border-border bg-muted p-1">
        {themeOptions.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
            />
            <span
              className={cn(
                "flex min-h-9 items-center justify-center rounded-md px-2 text-xs font-bold text-muted-foreground outline-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                preference === option.value &&
                  "bg-card text-card-foreground shadow-sm ring-1 ring-border",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SettingsPage() {
  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
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
          className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
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
