import { Link, useRouterState } from "@tanstack/react-router";

interface RoutePageProps {
  description: string;
  eyebrow: string;
  title: string;
}

export function RoutePage({ description, eyebrow, title }: RoutePageProps) {
  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <p className="m-0 text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </main>
  );
}

export function UnknownRoutePage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <main className="min-h-full bg-background px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <p className="m-0 text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
          Unknown route
        </p>
        <h1 className="mt-2 mb-0 text-3xl leading-none font-bold tracking-tight sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 mb-0 max-w-xl text-sm leading-6 text-muted-foreground">
          Blackglass does not have a page at <code className="font-mono">{pathname}</code>.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Return to Dashboard
        </Link>
      </div>
    </main>
  );
}
