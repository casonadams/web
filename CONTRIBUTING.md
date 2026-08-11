# Contributing

## Setup

```bash
pnpm install
```

The repository pins its package manager through the `packageManager` field, so
run commands with `pnpm` rather than `npm` or `yarn`.

## Checks

Run all three before opening a pull request; CI runs the same commands:

```bash
pnpm lint
pnpm test
pnpm typecheck
```

Use `pnpm format` to apply Biome formatting.

## Pull requests

- Keep changes focused on one problem.
- Add or update tests for behavior changes. Tests live beside the code as
  `*.test.mjs` and run through Vitest.
- Write commit messages as Conventional Commits, for example
  `fix(search): handle empty provider response`.
- Tests must not depend on live network access. Serve fixtures from a local
  HTTP server, as the existing tests do.

## Reporting problems

Open an issue for bugs and feature requests. For anything with security impact,
follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
