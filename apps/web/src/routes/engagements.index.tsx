import { createFileRoute } from "@tanstack/react-router";

import { EngagementWorkspace } from "../engagements/workspace.js";

export const Route = createFileRoute("/engagements/")({
  component: EngagementsIndexPage,
});

function EngagementsIndexPage() {
  return <EngagementWorkspace />;
}
