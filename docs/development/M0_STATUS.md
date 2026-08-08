# M0 Repository Status

Verified: 2026-08-08

## Bootstrap

- Repository: `Lbgosna/blackglass`.
- Visibility: private.
- Bootstrap commit: `c6dd9b693fd96e88f809df3425f03ee22dcadf21`.
- The bootstrap push CI completed successfully on its first attempt.
- Merge strategy is squash-only.
- Merged branches are deleted automatically.
- Branch updates from the GitHub UI are enabled.

## Protection availability

The repository owner currently uses GitHub Free. GitHub returned `403` when branch protection was requested for this private repository and reported that GitHub Pro or public visibility is required.

Blackglass remains private. M0 does not change repository visibility merely to obtain an automated control.

## Manual substitute

Until private-repository branch protection becomes available:

1. The bootstrap commit remains the only direct push to `main`.
2. Every later change uses an issue, branch/worktree, and pull request.
3. The owner confirms CI is successful on the latest PR revision.
4. The owner reviews the diff and performs the required walkthrough.
5. Unresolved review findings prevent merge.
6. The owner uses squash merge and allows GitHub to delete the merged branch.
7. Force pushes and deletion of `main` are prohibited by repository policy even though GitHub cannot enforce them for this private repository.

## Upgrade path

When private-repository protection becomes available, configure `main` to require:

- a pull request;
- the `Repository checks` status check on the latest revision;
- resolved conversations;
- no force pushes;
- no branch deletion;
- enforcement for the owner where supported.

The deliberately tiny pull request linked to issue #1 proves the manual workflow and records this limitation.
