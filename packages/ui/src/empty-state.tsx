import { FileSearch, FolderPlus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn.js";

export interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  title: string;
  variant?: "default" | "primary" | "filtered";
}

export function EmptyState({ action, description, title, variant = "default" }: EmptyStateProps) {
  const Icon = variant === "filtered" ? FileSearch : FolderPlus;
  return (
    <section
      className={cn(
        "rounded-lg border border-dashed border-border text-center",
        variant === "primary" && "bg-card px-6 py-12",
        variant === "filtered" && "bg-muted/35 px-5 py-8",
        variant === "default" && "bg-muted/35 px-5 py-8",
      )}
      data-empty-variant={variant}
    >
      {variant !== "default" && (
        <Icon className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" />
      )}
      <h3 className={cn("m-0 font-bold text-foreground", variant === "default" ? "text-base" : "text-lg")}>
        {title}
      </h3>
      <p className="mx-auto mt-2 mb-0 max-w-80 text-sm text-muted-foreground">{description}</p>
      {action && <div className={variant === "default" ? "mt-4" : "mt-5"}>{action}</div>}
    </section>
  );
}
