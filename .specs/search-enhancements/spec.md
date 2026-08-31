# Web Search Date Grounding and Search Enhancements Spec

## Status

Approved

## Problem

When the Pi coding agent performs web searches using the `websearch` tool, the underlying LLM does not inherently know today's real-time date (it is anchored to its training cutoff). Consequently, queries for "latest release", "recent updates", or year-specific topics often search for outdated years or omit time-sensitive keywords. Furthermore, `websearch` currently lacks capabilities to constrain results by time range (recency) or limit/exclude specific domains.

## Users and stakeholders

- **Pi Agent Users**: Expect accurate, current information when prompting for recent developments, libraries, and docs.
- **LLM Models in Pi**: Need temporal grounding in the prompt and structured search parameters (`recency`, `domains`) to target relevant search results.

## Goals

- Ground the agent with today's real-time date (YYYY-MM-DD) on every turn so it can formulate temporally accurate queries.
- Include execution timestamp metadata in search results so the LLM understands when the information was retrieved.
- Support an optional `recency` parameter (`"day" | "week" | "month" | "year"`) in `websearch` to request fresh results from search engines.
- Support optional domain filtering (`domains: string[]` supporting inclusion like `"github.com"` or exclusion like `"-spam.com"`) in `websearch`.

## Non-goals

- Implementing full LLM-based query rewrites or heavy external search pipelines (e.g. curator UIs or video processing).
- Adding new search engine network dependencies; keep existing fallback engine mechanisms (Brave, DuckDuckGo, Firecrawl, Yahoo) intact.

## Current behavior

- `extensions/web/index.ts` registers `websearch` and `webfetch` tools without any `before_agent_start` event handler.
- `webSearchParameters` in `extensions/web/tool-contracts.ts` only accepts `query` and `limit`.
- `extensions/web/search/format.ts` formats search results without search timestamps.
- Search engines in `extensions/web/search/engines/` receive only raw query strings without recency or domain constraints.

## Desired behavior

- On `before_agent_start`, Pi appends a concise temporal grounding instruction containing the current date in ISO format (YYYY-MM-DD).
- `websearch` tool accepts `query`, optional `limit`, optional `recency` (`"day" | "week" | "month" | "year"`), and optional `domains` (`string[]`).
- Search results header includes the search execution date (e.g. `**Search results for:** <query> (searched on YYYY-MM-DD)`).
- Search query and engine layer respects `recency` and `domains` filters across supported search engines.

## Requirements

- **REQ-001**: Pi extension must register a `before_agent_start` hook that appends today's date in `YYYY-MM-DD` format to `systemPrompt`.
- **REQ-002**: `webSearchParameters` contract must expose optional `recency` with values `["day", "week", "month", "year"]`.
- **REQ-003**: `webSearchParameters` contract must expose optional `domains` as an array of domain strings (where strings prefixed with `-` represent excluded domains).
- **REQ-004**: Search engines must apply `recency` filters (e.g., query qualifiers or engine-specific search parameters where supported).
- **REQ-005**: Results must be filtered against `domains` (only matching URLs allowed, excluded domains rejected).
- **REQ-006**: Formatted search result output must state the execution date.

## Invariants and security boundaries

- No external secrets or sensitive credentials may be leaked in prompts, queries, or logs.
- Domain filtering normalization must strictly sanitize user inputs and ignore malformed hostnames.
- The `before_agent_start` hook must not mutate or replace user custom instructions; it only appends the date grounding.
- Output byte and line limits (truncation invariants) must remain enforced.

## Definition of done

- All test suites (`vitest run`) pass including new unit tests for:
  - Date injection in `before_agent_start`.
  - Recency and domain filter options in `searchWeb` and engine wrappers.
  - Result formatting with timestamp headers.
  - Domain filtering logic (inclusion and exclusion).
- Typecheck and Biome linter/formatter pass with 0 errors.

## Acceptance criteria

- **AC-001**: Given an active Pi session with the extension loaded, when a turn begins, the agent's system prompt contains `Today's date is YYYY-MM-DD`.
- **AC-002**: Given `websearch({ query: "node.js", recency: "week" })`, search requests pass freshness/recency constraints to search backends.
- **AC-003**: Given `websearch({ query: "vitest", domains: ["github.com", "-blog.example.com"] })`, results only include URLs from `github.com` and exclude `blog.example.com`.
- **AC-004**: Given any search execution, the markdown header in the tool result contains `(searched on YYYY-MM-DD)`.

## Edge cases

- Invalid or malformed domain filter items (empty strings, invalid URLs, whitespace) are cleanly handled and ignored.
- Unknown recency values are rejected by schema validation.
- Missing `domains` or `recency` defaults safely to unrestricted search without regression.

## Constraints

- Pure TypeScript, zero extra runtime dependencies.
- Retain backward compatibility for existing callers of `websearch({ query, limit })`.

## Risks and mitigations

- **Risk**: Some search HTML backends may fail if query formatting includes unsupported operators.
  - **Mitigation**: Normalize and apply domain filtering post-fetch in addition to query-level hints, ensuring reliable results regardless of backend parser quirks.
