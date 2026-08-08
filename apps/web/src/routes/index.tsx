import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "../App.js";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
