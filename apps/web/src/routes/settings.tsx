import { createFileRoute } from "@tanstack/react-router";

import { RoutePage } from "../route-pages.js";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RoutePage
      eyebrow="Blackglass"
      title="Settings"
      description="Application, model endpoint, and local runner settings will live here."
    />
  );
}
