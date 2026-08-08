import { HealthResponseSchema } from "@blackglass/contracts";
import { Button, EmptyState, Status, useTheme, type ThemePreference } from "@blackglass/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type ApiState = "checking" | "connected" | "unavailable";

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
      <div className="inline-flex rounded-lg border border-border bg-muted p-1">
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
            <span className="flex min-h-9 items-center rounded-md px-3 text-sm font-bold text-muted-foreground outline-none peer-checked:bg-card peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [requestNumber, setRequestNumber] = useState(0);
  const latestRequest = useRef(0);

  const retry = useCallback(() => {
    setApiState("checking");
    setRequestNumber((current) => current + 1);
  }, []);

  useEffect(() => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    let mounted = true;

    async function checkHealth() {
      try {
        const response = await fetch("/health");
        if (!response.ok) throw new Error(`Health returned HTTP ${response.status}.`);
        const payload: unknown = await response.json();
        const result = HealthResponseSchema.safeParse(payload);
        if (!result.success) throw new Error("Health response did not match its contract.");
        if (mounted && latestRequest.current === requestId) setApiState("connected");
      } catch {
        if (mounted && latestRequest.current === requestId) setApiState("unavailable");
      }
    }

    void checkHealth();
    return () => {
      mounted = false;
    };
  }, [requestNumber]);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
              Blackglass
            </p>
            <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
              UI foundation
            </h1>
            <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
              Semantic surfaces and controls connected to the local control plane.
            </p>
          </div>
          <ThemeControl />
        </header>

        <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Runtime
                </p>
                <h2 className="mt-1 mb-0 text-lg font-bold">Control plane</h2>
              </div>
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                /health
              </code>
            </div>

            {apiState === "checking" && (
              <Status
                loading
                title="Checking API"
                detail="Waiting for the local control plane to respond."
              />
            )}
            {apiState === "connected" && (
              <Status
                tone="success"
                title="API connected"
                detail="The shared health contract returned a valid response."
              />
            )}
            {apiState === "unavailable" && (
              <Status
                tone="warning"
                title="API unavailable"
                detail="The control plane did not return a valid health response."
                action={<Button onClick={retry}>Retry</Button>}
              />
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
            <p className="m-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Actions
            </p>
            <h2 className="mt-1 mb-4 text-lg font-bold">Button primitives</h2>
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="quiet">Quiet</Button>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <p className="m-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Empty state
          </p>
          <h2 className="mt-1 mb-4 text-lg font-bold">Stable workspace surface</h2>
          <EmptyState
            title="No recent activity"
            description="Runtime events will appear here after the first local action."
            action={
              <Button variant="secondary" onClick={retry}>
                Check again
              </Button>
            }
          />
        </section>
      </div>
    </main>
  );
}
