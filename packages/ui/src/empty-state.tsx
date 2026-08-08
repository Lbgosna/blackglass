import type { ReactNode } from "react";

export interface EmptyStateProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-muted/35 px-5 py-8 text-center">
      <h3 className="m-0 text-base font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 mb-0 max-w-80 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
