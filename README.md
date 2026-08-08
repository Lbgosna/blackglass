# Blackglass

A local security workbench I am building for CTFs, labs, and assessments.

I want one place where I can create an engagement, keep targets and notes together, run tools, watch their output, save the raw evidence, turn results into findings, and ask a local model what to look at next. The main goal is speed. Scope warnings take one click to continue and every installed action stays runnable.

This is my first serious software project, so I am building it in vertical slices and using each milestone to learn what should stay simple.

## What I am building

- Engagements with saved target scopes, notes, flags, findings, and reports
- Nmap discovery with live output, cancellation, retry, and raw XML evidence
- HTTP probing and ffuf discovery
- A native Linux runner for local tools
- Process plugins that can be written in TypeScript, Python, Go, or Rust
- A React workbench with a resizable sidebar and bottom console
- Operator and Mentor modes for local or OpenAI-compatible models

The first useful slice is simple: create an engagement, enter a target, run Nmap, and see the services and evidence in the UI.

## Current status

M1 is complete. The loopback-only Fastify API and React app start through one supervised development command, use guarded isolated development storage, expose strict health and readiness contracts, and render the responsive application shell.

Current product work is M2: engagement and target context.

## Stack

- **Runtime:** Node.js 24, pnpm workspaces, strict TypeScript
- **Web:** React 19, Vite, TanStack Router and Query, Tailwind CSS v4
- **API:** Fastify, Zod, REST, Server-Sent Events
- **Data:** SQLite in WAL mode through Drizzle
- **Runner:** native unprivileged Linux service, executable plus argv process spawning
- **Plugins:** versioned NDJSON process protocol
- **Models:** configurable OpenAI-compatible endpoint, local by default

Native development is the primary path because my current LXC host does not run Docker. The release build will package the control plane with Compose and keep the tool runner on the host.

## Development docs

- [`AGENTS.md`](./AGENTS.md): rules for coding agents working in this repository
- [`docs/development/V0.1_PLAN.md`](./docs/development/V0.1_PLAN.md): product plan and milestone sequence
- [`docs/architecture/DECISION_GATES.md`](./docs/architecture/DECISION_GATES.md): decisions that need to be settled before their milestone
- [`docs/development/MAINTAINER_HANDBOOK.md`](./docs/development/MAINTAINER_HANDBOOK.md): issue, worktree, review, and release workflow
- [`docs/development/M1_STATUS.md`](./docs/development/M1_STATUS.md): verified executable-shell behavior
- [`docs/ui/constitution.md`](./docs/ui/constitution.md): shell, motion, theme, responsive, and accessibility behavior
