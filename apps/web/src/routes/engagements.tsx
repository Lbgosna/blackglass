import { createFileRoute } from "@tanstack/react-router";

import { RoutePage } from "../route-pages.js";

export const Route = createFileRoute("/engagements")({
  component: EngagementsPage,
});

function EngagementsPage() {
  return (
    <RoutePage
      eyebrow="Workspace"
      title="Engagements"
      description="Engagement pages will organize targets, runs, evidence, and reports here."
    />
  );
}
