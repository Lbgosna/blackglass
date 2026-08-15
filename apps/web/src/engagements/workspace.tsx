import type { Engagement } from "@blackglass/contracts";
import {
  Button,
  EmptyState,
  LoadingRegion,
  RecoverableError,
  Skeleton,
  StaleDataState,
} from "@blackglass/ui";
import { Link } from "@tanstack/react-router";

import { engagementMutationMessage, isRevisionConflict } from "./errors.js";
import {
  ENGAGEMENT_KIND_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  formatEngagementTimestamp,
} from "./format.js";
import {
  useArchiveEngagementMutation,
  useReopenEngagementMutation,
} from "./mutations.js";
import { partitionEngagements, useEngagementsQuery } from "./query.js";
import { useEngagementWorkspace } from "./workspace-context.js";

export function EngagementWorkspace({ engagementId }: { engagementId?: string }) {
  const engagements = useEngagementsQuery();
  const { openCreate } = useEngagementWorkspace();
  const hasData = engagements.data !== undefined;
  const retry = () => void engagements.refetch();

  if (!hasData && engagements.isFetching) {
    return (
      <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="m-0 text-3xl leading-none font-bold tracking-tight">Engagements</h1>
          <LoadingRegion label="Loading engagements" className="mt-6 space-y-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </LoadingRegion>
        </div>
      </main>
    );
  }

  if (!hasData && engagements.isError) {
    return (
      <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="mb-6 text-3xl leading-none font-bold tracking-tight">Engagements</h1>
          <RecoverableError
            variant="page"
            title="Engagements unavailable"
            description="The engagement list could not be loaded from the local control plane."
            onRetry={retry}
          />
        </div>
      </main>
    );
  }

  const records = engagements.data ?? [];
  const selected = engagementId
    ? records.find((engagement) => engagement.id === engagementId)
    : undefined;

  if (engagementId !== undefined && selected === undefined) {
    return (
      <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <RecoverableError
            variant="page"
            title="Engagement not found"
            description="That engagement is not in the current list. Refresh or return to the workspace."
            onRetry={retry}
            retryLabel="Refresh list"
          />
        </div>
      </main>
    );
  }

  const body =
    selected !== undefined ? (
      <EngagementDetail engagement={selected} />
    ) : records.length === 0 ? (
      <div>
        <h1 className="mb-6 text-3xl leading-none font-bold tracking-tight">Engagements</h1>
        <EmptyState
          variant="primary"
          title="No engagements yet"
          description="Create an engagement to start local CTF, lab, or assessment work."
          action={<Button onClick={openCreate}>New engagement</Button>}
        />
      </div>
    ) : (
      <EngagementIndex engagements={records} />
    );

  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        {engagements.isError ? (
          <StaleDataState
            title="Showing the last successful engagement list"
            description="The latest refresh failed. Existing engagements are still available."
            onRetry={retry}
          >
            {body}
          </StaleDataState>
        ) : (
          body
        )}
      </div>
    </main>
  );
}

function EngagementIndex({ engagements }: { engagements: readonly Engagement[] }) {
  const { active, archived } = partitionEngagements(engagements);
  return (
    <div>
      <header className="mb-6">
        <h1 className="m-0 text-3xl leading-none font-bold tracking-tight">Engagements</h1>
        <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
          Active and archived engagements from the local control plane.
        </p>
      </header>
      {active.length > 0 && (
        <section className="grid gap-2" aria-label="Active engagements">
          {active.map((engagement) => (
            <EngagementSummaryLink key={engagement.id} engagement={engagement} />
          ))}
        </section>
      )}
      {active.length === 0 && (
        <EmptyState
          variant="filtered"
          title="No active engagements"
          description="Archived engagements stay available below. Reopen one or create a new engagement."
        />
      )}
      {archived.length > 0 && (
        <section className="mt-8" aria-label="Archived engagements">
          <h2 className="m-0 text-sm font-bold text-muted-foreground">Archived</h2>
          <div className="mt-2 grid gap-2">
            {archived.map((engagement) => (
              <EngagementSummaryLink key={engagement.id} engagement={engagement} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EngagementSummaryLink({ engagement }: { engagement: Engagement }) {
  return (
    <Link
      to="/engagements/$engagementId"
      params={{ engagementId: engagement.id }}
      className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-foreground outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{engagement.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {ENGAGEMENT_KIND_LABELS[engagement.kind]} · {ENGAGEMENT_STATUS_LABELS[engagement.status]}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        rev {engagement.revision}
      </span>
    </Link>
  );
}

function EngagementDetail({ engagement }: { engagement: Engagement }) {
  const archive = useArchiveEngagementMutation();
  const reopen = useReopenEngagementMutation();
  const pending = archive.isPending || reopen.isPending;
  const error = archive.error ?? reopen.error;
  const conflict = isRevisionConflict(error);
  const reverse =
    engagement.status === "active"
      ? {
          label: "Archive engagement",
          run: () =>
            archive.mutate({
              engagementId: engagement.id,
              expectedRevision: engagement.revision,
            }),
        }
      : {
          label: "Reopen engagement",
          run: () =>
            reopen.mutate({
              engagementId: engagement.id,
              expectedRevision: engagement.revision,
            }),
        };

  return (
    <article>
      <p className="m-0 text-xs font-bold tracking-widest text-muted-foreground uppercase">
        {ENGAGEMENT_KIND_LABELS[engagement.kind]}
      </p>
      <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight">{engagement.name}</h1>
      <p className="mt-3 mb-0 text-sm text-muted-foreground">
        <span aria-label={`Status: ${ENGAGEMENT_STATUS_LABELS[engagement.status]}`}>
          {ENGAGEMENT_STATUS_LABELS[engagement.status]}
        </span>
        <span className="mx-2 text-border">·</span>
        <span className="font-mono">rev {engagement.revision}</span>
      </p>
      <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm">
        <Detail term="Description" value={engagement.description ?? "None"} />
        <Detail
          term="Authorization context"
          value={engagement.authorizationContext ?? "None"}
        />
        <Detail
          term="Auto-continue warnings"
          value={engagement.autoContinueWarnings ? "On" : "Off"}
        />
        <Detail term="Created" value={formatEngagementTimestamp(engagement.createdAt)} />
        <Detail term="Updated" value={formatEngagementTimestamp(engagement.updatedAt)} />
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button disabled={pending} onClick={reverse.run} variant="secondary">
          {pending ? "Working" : reverse.label}
        </Button>
      </div>
      {error && (
        <p className="mt-3 mb-0 text-sm text-destructive" role="alert">
          {conflict
            ? "This engagement changed. Refreshing the latest revision."
            : engagementMutationMessage(error)}
        </p>
      )}
      <p className="mt-8 mb-0 text-sm text-muted-foreground">
        Targets, runs, findings, evidence, and reports are not available in this slice.
      </p>
    </article>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="m-0 text-xs text-muted-foreground">{term}</dt>
      <dd className="mt-1 mb-0 whitespace-pre-wrap text-foreground">{value}</dd>
    </div>
  );
}
