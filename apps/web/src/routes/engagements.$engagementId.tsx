import { createFileRoute } from "@tanstack/react-router";

import { EngagementWorkspace } from "../engagements/workspace.js";

export const Route = createFileRoute("/engagements/$engagementId")({
  component: EngagementDetailPage,
});

function EngagementDetailPage() {
  const { engagementId } = Route.useParams();
  return <EngagementWorkspace engagementId={engagementId} />;
}
