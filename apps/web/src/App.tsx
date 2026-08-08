import {
  ApplicationShell,
  Button,
  cn,
  EmptyState,
  FatalErrorBoundary,
  LoadingRegion,
  RecoverableError,
  SidebarCardRow,
  SidebarCompactRow,
  SidebarRowAction,
  SidebarShelf,
  Skeleton,
  StaleDataState,
  Status,
  type ConsolePanel,
} from "@blackglass/ui";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useHealthQuery } from "./health-query.js";

type GalleryState = "loading" | "empty" | "filtered" | "stale" | "recoverable" | "fatal";

const galleryStates: ReadonlyArray<{ label: string; value: GalleryState }> = [
  { label: "Loading", value: "loading" },
  { label: "Empty", value: "empty" },
  { label: "Filtered", value: "filtered" },
  { label: "Stale", value: "stale" },
  { label: "Recoverable", value: "recoverable" },
  { label: "Fatal", value: "fatal" },
];

const navigationLinks = [
  { label: "Dashboard", to: "/" },
  { label: "Engagements", to: "/engagements" },
  { label: "Plugins", to: "/plugins" },
] as const;

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

interface SyntheticWorkItem {
  background?: boolean;
  context: string;
  id: string;
  metadata: string;
  selected?: boolean;
  status: string;
  title: string;
}

const activeWork: readonly SyntheticWorkItem[] = [
  {
    id: "active-service-sweep",
    context: "northstar.lab",
    title: "Service sweep",
    status: "Running",
    metadata: "3m 18s · 12 services",
  },
  {
    id: "active-web-review",
    context: "portal.lab",
    title: "Web surface review",
    status: "Needs input",
    metadata: "2 findings",
    selected: true,
  },
  {
    id: "active-api-map",
    context: "api.lab",
    title: "API route map",
    status: "Waiting",
    metadata: "Queued locally",
    background: true,
  },
];

const queuedWork: readonly SyntheticWorkItem[] = [
  {
    id: "queued-http-probe",
    context: "northstar.lab",
    title: "HTTP probe",
    status: "Queued",
    metadata: "4 origins",
  },
  {
    id: "queued-content-map",
    context: "portal.lab",
    title: "Content map",
    status: "Paused",
    metadata: "Ready to resume",
  },
];

const historyWork: readonly SyntheticWorkItem[] = Array.from({ length: 40 }, (_, index) => {
  const number = index + 1;
  return {
    id: `history-${number}`,
    context: number % 2 === 0 ? "northstar.lab" : "portal.lab",
    title: `Archived task ${number}`,
    status: number === 38 ? "Reviewed" : "Complete",
    metadata: `${number + 2}m`,
  };
});

const currentHistoryId = "history-38";

function ConsolePlaceholder({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="m-0 text-sm font-bold">{title}</p>
      <p className="mt-1 mb-0 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function SyntheticSurface() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="synthetic-stale-content">
      <article className="rounded-lg border border-border bg-card p-4">
        <p className="m-0 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          northstar.lab
        </p>
        <p className="mt-2 mb-0 text-base font-bold">12 discovered services</p>
        <p className="mt-1 mb-0 font-mono text-xs text-muted-foreground">updated 4m ago</p>
      </article>
      <article className="rounded-lg border border-border bg-card p-4">
        <p className="m-0 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          portal.lab
        </p>
        <p className="mt-2 mb-0 text-base font-bold">2 draft findings</p>
        <p className="mt-1 mb-0 font-mono text-xs text-muted-foreground">updated 7m ago</p>
      </article>
    </div>
  );
}

function SyntheticCrash({ crash }: { crash: boolean }) {
  if (crash) throw new Error("Synthetic gallery render failure");
  return <SyntheticSurface />;
}

function StateGallery() {
  const [state, setState] = useState<GalleryState>("loading");
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [fatalCrash, setFatalCrash] = useState(true);
  const [reloadRequested, setReloadRequested] = useState(false);

  const selectState = (next: GalleryState) => {
    if (next === "fatal") {
      setFatalCrash(true);
      setReloadRequested(false);
    }
    setState(next);
  };

  return (
    <section className="mt-5 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            UI states
          </p>
          <h2 className="mt-1 mb-0 text-lg font-bold">Stable workspace states</h2>
        </div>
        <div className="flex max-w-full flex-wrap gap-1" role="group" aria-label="Preview state">
          {galleryStates.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={state === option.value}
              className={cn(
                "min-h-11 rounded-md px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
              onClick={() => selectState(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5" data-testid="state-gallery-output">
        {state === "loading" && (
          <LoadingRegion label="Loading workspace overview" className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-7 w-56 max-w-full" />
              <Skeleton className="mt-2 h-4 w-full max-w-md" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </LoadingRegion>
        )}

        {state === "empty" && (
          <EmptyState
            variant="primary"
            title="No workspace activity yet"
            description="Start a local action when you are ready to populate this workspace."
            action={<Button onClick={() => setState("loading")}>Preview loading</Button>}
          />
        )}

        {state === "filtered" && (
          <EmptyState
            variant="filtered"
            title="No results match this view"
            description="Clear the current filters to show the existing workspace activity."
            action={
              <Button variant="secondary" onClick={() => setState("empty")}>
                Clear preview filters
              </Button>
            }
          />
        )}

        {state === "stale" && (
          <StaleDataState
            title="Showing the last successful refresh"
            description={`The latest refresh failed. Existing data is still available. Attempts: ${refreshAttempts}.`}
            onRetry={() => setRefreshAttempts((current) => current + 1)}
          >
            <SyntheticSurface />
          </StaleDataState>
        )}

        {state === "recoverable" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <RecoverableError
              title="This panel could not load"
              description={`The rest of the workspace is still usable. Retry attempts: ${retryAttempts}.`}
              onRetry={() => setRetryAttempts((current) => current + 1)}
            />
            <RecoverableError
              variant="page"
              title="Workspace view unavailable"
              description="Retry this synthetic view without reloading the shell."
              onRetry={() => setRetryAttempts((current) => current + 1)}
            />
          </div>
        )}

        {state === "fatal" && (
          <div>
            <FatalErrorBoundary
              onReload={() => setReloadRequested(true)}
              onRetry={() => setFatalCrash(false)}
            >
              <SyntheticCrash crash={fatalCrash} />
            </FatalErrorBoundary>
            {reloadRequested && (
              <p className="mt-3 mb-0 text-sm text-muted-foreground" role="status">
                Synthetic reload requested. The application was not reloaded.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
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
  const navigate = useNavigate();

  return (
    <div>
      <nav aria-label="Global" className="p-3 pb-1">
        <p className="px-2 pb-2 text-xs font-bold tracking-widest text-sidebar-muted-foreground uppercase">
          Workspace
        </p>
        <ul className="m-0 list-none space-y-1 p-0">
          {navigationLinks.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                activeOptions={{ exact: true }}
                activeProps={{
                  className: "bg-sidebar-active text-sidebar-foreground",
                }}
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                inactiveProps={{
                  className:
                    "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
                }}
                onClick={onNavigate}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-3 px-3 pt-2 pb-4" aria-label="Work gallery">
        <section>
          <h2 className="m-0 min-h-9 px-2 text-xs font-bold tracking-wide text-sidebar-muted-foreground uppercase">
            Active work
          </h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {activeWork.map((item) => (
              <li key={item.id}>
                <SidebarCardRow
                  {...item}
                  href={`/#${item.id}`}
                  itemId={item.id}
                  onNavigate={onNavigate}
                  action={
                    <SidebarRowAction
                      label={`Open ${item.title}`}
                      onClick={() => {
                        void navigate({ to: "/", hash: item.id });
                        onNavigate();
                      }}
                    >
                      Open
                    </SidebarRowAction>
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <SidebarShelf
          defaultOpen={false}
          getId={(item) => item.id}
          items={queuedWork}
          renderItem={(item) => (
            <SidebarCompactRow
              {...item}
              href={`/#${item.id}`}
              itemId={item.id}
              onNavigate={onNavigate}
            />
          )}
          title="Queued"
        />

        <SidebarShelf
          currentId={currentHistoryId}
          getId={(item) => item.id}
          items={historyWork}
          paginated
          renderItem={(item) => (
            <SidebarCompactRow
              {...item}
              current={item.id === currentHistoryId}
              href={`/#${item.id}`}
              itemId={item.id}
              onNavigate={onNavigate}
            />
          )}
          title="History"
        />
      </div>
    </div>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      to="/settings"
      activeOptions={{ exact: true }}
      activeProps={{ className: "bg-sidebar-active text-sidebar-foreground" }}
      className="flex min-h-14 items-center px-5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      inactiveProps={{
        className:
          "text-sidebar-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground",
      }}
      onClick={onNavigate}
    >
      Settings
    </Link>
  );
}

export function ApplicationLayout() {
  return (
    <ApplicationShell
      consolePanels={consolePanels}
      consoleStatus="No active runs"
      sidebarContent={(closeMobile) => <SidebarNavigation onNavigate={closeMobile} />}
      sidebarFooter={(closeMobile) => <SidebarFooter onNavigate={closeMobile} />}
      sidebarHeader={<SidebarHeader />}
    >
      <Outlet />
    </ApplicationShell>
  );
}

export function DashboardPage() {
  const health = useHealthQuery();
  const hasHealthData = health.data !== undefined;
  const retryHealth = () => void health.refetch();

  return (
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

            {!hasHealthData && health.isFetching && (
              <Status
                loading
                title="Checking API"
                detail="Waiting for the local control plane to respond."
              />
            )}
            {hasHealthData && (
              <div className="space-y-3">
                <Status
                  tone="success"
                  title="API connected"
                  detail="The shared health contract returned a valid response."
                />
                {health.isError && (
                  <Status
                    tone="warning"
                    title="Health refresh failed"
                    detail="Showing the last valid health result."
                    action={<Button onClick={retryHealth}>Retry</Button>}
                  />
                )}
              </div>
            )}
            {!hasHealthData && health.isError && !health.isFetching && (
              <Status
                tone="warning"
                title="API unavailable"
                detail="The control plane did not return a valid health response."
                action={<Button onClick={retryHealth}>Retry</Button>}
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
              <Button variant="secondary" onClick={retryHealth}>
                Check again
              </Button>
            }
          />
        </section>

        <StateGallery />
      </div>
    </main>
  );
}
