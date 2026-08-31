# Web Search Date Grounding and Search Enhancements Implementation Plan

## Research

- **Pi Extension API**: `pi.on("before_agent_start", (event) => ({ systemPrompt: ... }))` allows non-destructive system prompt augmentation per turn.
- **TypeBox Schemas**: `tool-contracts.ts` uses TypeBox (`Type.Object`, `Type.Optional`, `Type.Array`, `Type.Union`, `Type.Literal`).
- **Domain Normalization & Filtering**: Can parse domain filters into `{ allowed: string[], blocked: string[] }`, normalising inputs (handling protocol prefixes, leading/trailing periods, lowercase matching, subdomains).
- **Search Engine Query Formatting & Freshness**:
  - Brave web query supports `freshness: "pd" | "pw" | "pm" | "py"`.
  - DuckDuckGo / Yahoo / general engines support `site:...` and `-site:...` or temporal query hints (`when:d`, `when:w`, etc.).
  - Post-search filtering guarantees domain constraints even if an engine ignores `site:` syntax.

## Reuse

- Existing `tool-contracts.ts` schema definitions and type exports.
- `extensions/web/search/search.ts` throttling and coalescing mechanics.
- `extensions/web/search/format.ts` UTF-8 safe truncation and result formatting.
- `extensions/web/search/result-utils.ts` for result filtering and normalization.

## Invariants and security boundaries

- Strict output size bounding (`MAX_SEARCH_OUTPUT_BYTES = 8000`).
- No SSRF or protocol bypass; domain filter only matches hostname from valid `http:` / `https:` URLs.
- Extension `before_agent_start` only chains onto `event.systemPrompt` without overriding other extension modifications.

## Slices & Tasks

### Slice 1: Real-Time Date Grounding (Score: 2)
- **Task 1.1**: Add `before_agent_start` listener in `extensions/web/index.ts` appending `Today's date is YYYY-MM-DD. Factor in this date when searching for recent/latest information.`
- **Task 1.2**: Update `extensions/web/search/format.ts` to include `(searched on YYYY-MM-DD)` in search result markdown header.
- **Task 1.3**: Add unit tests in `extensions/web/search/search.test.mjs` and `extensions/web/index.test.mjs` verifying date injection and header formatting.

### Slice 2: Tool Contract & Domain Filtering (Score: 3)
- **Task 2.1**: Update `webSearchParameters` in `extensions/web/tool-contracts.ts` to add optional `recency` (`"day" | "week" | "month" | "year"`) and `domains` (`string[]`).
- **Task 2.2**: Implement domain filter parsing and URL matching in `extensions/web/search/result-utils.ts` (handling inclusion and `-` exclusion).
- **Task 2.3**: Unit test domain filter normalization and URL matching.

### Slice 3: Search Engine Recency & Integration (Score: 3)
- **Task 3.1**: Extend `SearchOptions` / `searchWeb` in `extensions/web/search/search.ts` to pass `recency` and `domains`.
- **Task 3.2**: Update search engines (`brave.ts`, `ddg-lite.ts`, etc.) to apply recency parameters / query terms where appropriate.
- **Task 3.3**: Filter results in `searchWeb` using domain filters before returning.
- **Task 3.4**: Update `extensions/web/index.ts` tool execute handler to forward `params.recency` and `params.domains`.

### Slice 4: Verification & Quality Gate (Score: 1)
- **Task 4.1**: Run `pnpm test` (Vitest) to ensure all tests pass.
- **Task 4.2**: Run Biome check / format and TypeScript typecheck (`pnpm run check`).

## Verification Plan

- `vitest run` covering all unit tests.
- Verify date grounding in `before_agent_start`.
- Verify `websearch` parameter schema and execution with combinations of `query`, `recency`, and `domains`.
