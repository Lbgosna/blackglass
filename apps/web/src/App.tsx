import { ApplicationShell, Button, Status, type ConsolePanel } from "@blackglass/ui";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { CreateEngagementDialog } from "./engagements/create-dialog.js";
import { EngagementSidebarList } from "./engagements/sidebar.js";
import {
  EngagementWorkspaceProvider,
  useEngagementWorkspace,
} from "./engagements/workspace-context.js";
import { useSystemStatusQuery } from "./system-status-query.js";

const navigationLinks = [
  { label: "Dashboard", to: "/" },
  { label: "Engagements", to: "/engagements" },
  { label: "Plugins", to: "/plugins" },
] as const;

const consolePanels: readonly ConsolePanel[] = [
  {
    value: "advisor",
    label: "Advisor",
    content: <ConsolePlaceholder title="Advisor" detail="Evidence-backed guidance is not available yet." />,
  },
  {
    value: "activity",
    label: "Activity",
    content: (
      <ConsolePlaceholder title="Activity" detail="Run and workspace events are not available yet." />
    ),
  },
  {
    value: "raw-output",
    label: "Raw output",
    content: <ConsolePlaceholder title="Raw output" detail="Live tool output is not available yet." />,
  },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10.4 10.4 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ConsolePlaceholder({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <p className="m-0 text-sm font-bold">{title}</p>
      <p className="mt-1 mb-0 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function SidebarHeader() {
  return (
    <div className="flex min-h-12 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
      <span className="size-3.5 shrink-0 rounded-[4px] bg-primary" aria-hidden="true" />
      <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.03em] text-sidebar-foreground">
        BLACKGLASS
      </p>
    </div>
  );
}

function SidebarActions({
  onCreate,
  onNavigate,
}: {
  onCreate: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5">
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Search is not available yet"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-[13px] text-sidebar-muted-foreground"
      >
        <SearchIcon />
        <span className="truncate">Search unavailable</span>
      </button>
      <button
        type="button"
        aria-label="New engagement"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground outline-none hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          onNavigate();
          onCreate();
        }}
      >
        <PlusIcon />
      </button>
    </div>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div>
      <nav aria-label="Global" className="px-2 pt-1 pb-2">
        <ul className="m-0 list-none space-y-0.5 p-0">
          {navigationLinks.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                activeOptions={{ exact: link.to !== "/engagements" }}
                activeProps={{
                  className: "bg-sidebar-active text-sidebar-foreground",
                }}
                className="flex min-h-11 items-center rounded-md px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <EngagementSidebarList onNavigate={onNavigate} />
    </div>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      to="/settings"
      activeOptions={{ exact: true }}
      activeProps={{ className: "bg-sidebar-active text-sidebar-foreground" }}
      className="flex min-h-14 items-center px-5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);

  return (
    <EngagementWorkspaceProvider openCreate={openCreate}>
      <ApplicationShell
        consolePanels={consolePanels}
        consoleStatus="No active runs"
        sidebarActions={(closeMobile) => (
          <SidebarActions onCreate={openCreate} onNavigate={closeMobile} />
        )}
        sidebarContent={(closeMobile) => <SidebarNavigation onNavigate={closeMobile} />}
        sidebarFooter={(closeMobile) => <SidebarFooter onNavigate={closeMobile} />}
        sidebarHeader={<SidebarHeader />}
      >
        <Outlet />
      </ApplicationShell>
      <CreateEngagementDialog open={createOpen} onOpenChange={setCreateOpen} />
    </EngagementWorkspaceProvider>
  );
}

export function DashboardPage() {
  const systemStatus = useSystemStatusQuery();
  const { openCreate } = useEngagementWorkspace();
  const hasSystemStatus = systemStatus.data !== undefined;
  const retrySystemStatus = () => void systemStatus.refetch();

  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <h1 className="mt-0 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
            Workspace
          </h1>
          <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
            Local engagements and control-plane status. Future runner and advisor surfaces stay
            unavailable until they exist.
          </p>
        </header>

        <section className="rounded-xl border border-border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-bold">Control plane</h2>
            <Button variant="quiet" onClick={retrySystemStatus}>
              Check again
            </Button>
          </div>

          {!hasSystemStatus && systemStatus.isFetching && (
            <Status
              loading
              title="Checking system"
              detail="Waiting for the local runtime status."
            />
          )}
          {hasSystemStatus && !systemStatus.isError && (
            <Status
              tone={systemStatus.data.overall === "ready" ? "success" : "warning"}
              title={systemStatus.data.overall === "ready" ? "System ready" : "System not ready"}
              detail={
                systemStatus.data.developmentStorage === "ready"
                  ? "Control plane and development storage are ready."
                  : "Development storage is not ready."
              }
            />
          )}
          {hasSystemStatus && systemStatus.isError && (
            <Status
              tone="warning"
              title={`Last known: system ${systemStatus.data.overall === "ready" ? "ready" : "not ready"}`}
              detail="Status refresh failed. Showing the last-known system and development storage state."
              action={<Button onClick={retrySystemStatus}>Retry</Button>}
            />
          )}
          {!hasSystemStatus && systemStatus.isError && !systemStatus.isFetching && (
            <Status
              tone="warning"
              title="System unavailable"
              detail="No valid runtime status was received."
              action={<Button onClick={retrySystemStatus}>Retry</Button>}
            />
          )}
        </section>

        <section className="mt-5">
          <EmptyEngagementPrompt onCreate={openCreate} />
        </section>
      </div>
    </main>
  );
}

function EmptyEngagementPrompt({ onCreate }: { onCreate: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-4">
      <p className="m-0 text-sm text-muted-foreground">
        Open Engagements to load records from the API, or create one here.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreate}>New engagement</Button>
        <Button
          variant="secondary"
          onClick={() => {
            void navigate({ to: "/engagements" });
          }}
        >
          View engagements
        </Button>
      </div>
    </div>
  );
}
