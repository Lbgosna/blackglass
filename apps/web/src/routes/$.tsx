import { createFileRoute } from "@tanstack/react-router";

import { UnknownRoutePage } from "../route-pages.js";

export const Route = createFileRoute("/$")({
  component: UnknownRoutePage,
});
