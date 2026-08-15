import { createFileRoute } from "@tanstack/react-router";

import { RoutePage } from "../route-pages.js";

export const Route = createFileRoute("/plugins")({
  component: PluginsPage,
});

function PluginsPage() {
  return (
    <RoutePage
      eyebrow="Workspace"
      title="Plugins"
      description="Installed tool adapters and their local requirements will appear here. Plugin execution is not connected yet."
    />
  );
}
