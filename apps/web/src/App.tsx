import { HealthResponseSchema } from "@blackglass/contracts";
import {
  ApplicationShell,
  Button,
  cn,
  EmptyState,
  Status,
  useTheme,
  type ConsolePanel,
  type ThemePreference,
} from "@blackglass/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type ApiState = "checking" | "connected" | "unavailable";

const themeOptions: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

const consolePanels: readonly ConsolePanel[] = [
  {
    value: "advisor",
    label: "Advisor",
    content: <ConsolePlaceholder title="Advisor" detail="Evidence-backed guidance will appear here." />,
  },
  {
    value: "activity",
    label: "Activity",
    content: <ConsolePlaceholder title="Activity" detail="Run and workspace events will appear here." />,
  },
  {
    value: "raw-output",
    label: "Raw output",
    content: <ConsolePlaceholder title="Raw output" detail="Live tool output will appear here." />,
  },
];

function ConsolePlaceholder({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="m-0 text-sm font-bold">{title}</p>
      <p className="mt-1 mb-0 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ThemeControl() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-xs font-bold tracking-widest text-sidebar-muted-foreground uppercase">
        Theme
      </legend>
      <div className="grid grid-cols-3 rounded-lg border border-sidebar-border bg-sidebar-control p-1">
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
                "flex min-h-9 items-center justify-center rounded-md px-2 text-xs font-bold text-sidebar-muted-foreground outline-none transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                preference === option.value &&
                  "bg-sidebar-active text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border",
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

function SidebarHeader() {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4 pt-[env(safe-area-inset-top)]">
      <span
        className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-sm font-black text-primary-foreground"
        aria-hidden="true"
      >
        BG
      </span>
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-extrabold tracking-wide">Blackglass</p>
        <p className="m-0 truncate text-xs text-sidebar-muted-foreground">Local workbench</p>
      </div>
    </div>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate: () => void }) {
  const links = [
    { href: "#gallery", label: "Dashboard", active: true },
    { href: "#engagements", label: "Engagements", active: false },
    { href: "#plugins", label: "Plugins", active: false },
  ];

  return (
    <nav aria-label="Global" className="p-3">
      <p className="px-2 pb-2 text-xs font-bold tracking-widest text-sidebar-muted-foreground uppercase">
        Workspace
      </p>
      <ul className="m-0 list-none space-y-1 p-0">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-md px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                link.active
                  ? "bg-sidebar-active text-sidebar-foreground"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
              }`}
              onClick={onNavigate}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <a
      href="#settings"
      className="flex min-h-14 items-center px-5 text-sm font-bold text-sidebar-muted-foreground outline-none hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={onNavigate}
    >
      Settings
    </a>
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
    <ApplicationShell
      consolePanels={consolePanels}
      consoleStatus="No active runs"
      sidebarActions={
        <div className="p-4">
          <ThemeControl />
        </div>
      }
      sidebarContent={(closeMobile) => <SidebarNavigation onNavigate={closeMobile} />}
      sidebarFooter={(closeMobile) => <SidebarFooter onNavigate={closeMobile} />}
      sidebarHeader={<SidebarHeader />}
    >
      <main id="gallery" className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto w-full max-w-3xl">
          <header className="mb-8">
            <p className="m-0 text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
              Blackglass
            </p>
            <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
              Application shell
            </h1>
            <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
              Shared navigation, workspace, and console surfaces connected to the local control
              plane.
            </p>
          </header>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
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
    </ApplicationShell>
  );
}
