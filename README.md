# Blackglass

Blackglass is a fast, local-first, open-source security workbench for CTFs, labs, and operator-authorized assessments.

The v0.1 goal is one complete workflow:

```text
engagement
  -> targets and optional scope guardrails
  -> Nmap
  -> HTTP probe
  -> ffuf
  -> evidence and findings
  -> report
  -> local AI advisor
```

Blackglass is designed for a single user on Linux. It warns without policing: an out-of-scope or noisy action may ask for one confirmation, but any available action remains runnable. Blackglass is not a SaaS product or a GitHub/coding-agent manager.

## Development status

Current milestone: **M0 — Governed repository**.

The first useful vertical slice completes at **M4 — Nmap workflow**. The complete v0.1 scope continues through HTTP discovery, ffuf, analyst records, the local advisor, packaging, and release hardening.

## Repository guidance

Read these files before implementation:

1. [`AGENTS.md`](./AGENTS.md) — executable rules for coding agents.
2. [`docs/development/V0.1_PLAN.md`](./docs/development/V0.1_PLAN.md) — accepted product and delivery baseline.
3. [`docs/architecture/DECISION_GATES.md`](./docs/architecture/DECISION_GATES.md) — decisions required before security-sensitive milestones.
4. [`docs/development/MAINTAINER_HANDBOOK.md`](./docs/development/MAINTAINER_HANDBOOK.md) — owner workflow for issues, worktrees, PRs, review, and releases.

Planning documents do not authorize pushes, GitHub mutations, merges, releases, secret changes, or destructive operations. Those actions require explicit owner authorization when performed.
