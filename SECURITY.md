# Security Policy

## Supported versions

Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/casonadams/web/security/advisories/new).
Please do not open a public issue for a security problem.

Include the affected version or commit, reproduction steps, and the impact you
observed. Expect an initial response within seven days.

## Scope

This package fetches attacker-influenced URLs on behalf of an agent, so the
areas below are the most security-relevant:

- **Server-side request forgery.** `webfetch` rejects loopback, private,
  link-local, reserved, and other non-public destinations, and re-checks every
  redirect target. Setting `WEB_ALLOW_PRIVATE_NETWORK=true` disables that
  protection on purpose; reports that rely on it are out of scope.
- **Credential leakage across redirects.** Request headers must not follow a
  redirect to a different origin.
- **Resource exhaustion.** Response size, output size, timeout, and PDF worker
  limits are documented in `README.md`. A bypass of any of those bounds is in
  scope.
