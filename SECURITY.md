# Security Policy

## Supported version

Security fixes are made on the latest commit of `main`.

## Report a vulnerability

Use GitHub's
[private vulnerability reporting](https://github.com/casonadams/web/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

Include the affected commit, reproduction steps, expected impact, and any known
mitigations. You should receive an initial response within seven days.

## Security model

This extension fetches and parses untrusted internet content on behalf of a pi
agent. Its primary protections are:

- Only HTTP and HTTPS URLs are accepted. URLs containing credentials are
  rejected.
- Loopback, private, link-local, reserved, and other non-public addresses are
  blocked by default. Hostnames are checked during DNS resolution, and every
  redirect destination is checked again.
- Caller-supplied request headers are removed before following a cross-origin
  redirect.
- Redirects, retries, download sizes, returned output, caches, request time,
  extraction time, and PDF extraction concurrency are bounded.
- PDF parsing runs in worker threads so extraction can be terminated without
  blocking the main process indefinitely.

Setting `WEB_ALLOW_PRIVATE_NETWORK=true` intentionally permits local and private
network access. Only enable it when the agent and every URL it may fetch are
trusted.

Fetched content remains untrusted input. This extension extracts text but does
not verify the accuracy, safety, or intent of that content. It does not execute
page JavaScript.

## In scope

Examples of security issues worth reporting include:

- reaching a blocked network destination through URL parsing, DNS, redirects,
  or alternate IP representations;
- leaking request headers or URL credentials to another origin;
- bypassing a download, output, timeout, cache, redirect, retry, or PDF worker
  bound;
- executing code or accessing local files while parsing remote content; and
- exposing fetched content or request data outside the tool result.

Reports that require `WEB_ALLOW_PRIVATE_NETWORK=true` solely to reach a private
address are expected behavior rather than a vulnerability.
