# Web Extension

A pi extension package that provides two tools: `websearch` and `webfetch`.
Both are implemented in TypeScript and run without a subprocess.

## Install

```bash
pi install git:git@github.com:casonadams/web.git
```

For a one-off run:

```bash
pi -e git:git@github.com:casonadams/web.git
```

## How it works

- **`webfetch`** uses Node's built-in `fetch`, limits the downloaded response,
  extracts meaningful HTML with semantic `<main>`/`<article>` elements or
  Mozilla Readability, converts the selected HTML with `html-to-text`, extracts
  text-based PDFs with metadata and links using `unpdf`, resolves relative
  Markdown links, formats RSS/Atom feeds and sitemaps, formats CSV/TSV as a
  bounded Markdown table, and formats JSON and plain text. It respects declared
  and HTML character encodings, HTML `<base href>`, redirects, line pagination,
  and a final output byte cap. It does not start a subprocess. Image-only PDFs
  report that OCR is required.
- **`websearch`** fetches search-engine HTML directly with Node's `fetch`
  using a text-browser user agent, and randomly selects among DuckDuckGo
  Lite and Yahoo as the provider. Results are normalized,
  deduplicated, and annotated with hostname, provider, and useful content
  hints. Explicit `site:` constraints are enforced across every provider.
  GitHub `blob` URLs are converted to raw content URLs when direct fetching
  is preferable. If the selected engine returns no results, the tool retries
  conservative query variants with quotes or natural-language filler
  removed, then moves on to the next randomly selected engine.

A text-browser user agent is used because search engines allowlist known
text browsers (Lynx, w3m, links) while challenging generic clients such as
curl and headless browsers. The Lynx user-agent string is sent, but no lynx
binary is required.

`webfetch` blocks loopback, private, link-local, reserved, and other non-public
addresses by default, including every redirect target. Set
`WEB_ALLOW_PRIVATE_NETWORK=true` only when intentionally fetching local
services. The user also gates calls through the `guard` extension.

## Dependencies

Runtime dependencies are declared in `package.json`:

- `@mozilla/readability` for article and documentation extraction.
- `linkedom` for the HTML DOM used by Readability.
- `html-to-text` for structured text conversion.
- `unpdf` for extracting text, metadata, and links from PDFs with a bundled
  PDF.js build.
- `ipaddr.js` for private and non-public network address classification.

Install the dependencies with `pnpm install`. Neither tool requires a
subprocess or an external browser.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_MAX_RESULTS` | `5` | Default search results (tool maximum is 10) |
| `WEB_SEARCH_TIMEOUT` | `12` | Timeout per search provider in seconds |
| `WEB_SEARCH_TOTAL_TIMEOUT` | `30` | End-to-end timeout for all search providers in seconds |
| `WEB_SEARCH_BACKOFF_MS` | `500` | Delay between engine attempts after a failure; a `Retry-After` header overrides it |
| `WEB_SEARCH_MAX_BYTES` | `2000000` | Maximum search response size |
| `WEB_FETCH_TIMEOUT` | `8` | End-to-end network timeout, including retries and redirects, in seconds |
| `WEB_EXTRACTION_TIMEOUT` | `15` | PDF extraction timeout in seconds, including queue time |
| `WEB_PDF_WORKER_CONCURRENCY` | `2` | Maximum concurrent PDF workers (maximum 8) |
| `WEB_FETCH_LIMIT` | `200` | Default lines returned by `webfetch` |
| `WEB_FETCH_MAX_BYTES` | `5000000` | Maximum non-PDF response size |
| `WEB_PDF_MAX_BYTES` | `20000000` | Maximum PDF response size |
| `WEB_OUTPUT_MAX_BYTES` | `45000` | Maximum returned tool text per call |
| `WEB_ALLOW_PRIVATE_NETWORK` | `false` | Permit local/private destinations |
| `WEB_HTTP_RETRIES` | `1` | Retries for transient network/HTTP failures (maximum 5) |
| `WEB_FETCH_CACHE_TTL` | `60` | Extraction-cache lifetime in seconds; `0` disables |
| `WEB_FETCH_CACHE_ENTRIES` | `8` | Maximum cached extractions |
| `WEB_FETCH_CACHE_MAX_BYTES` | `20000000` | Maximum total extracted cache text |
| `WEB_REGION` | `wt-wt` | DuckDuckGo region code, such as `us-en` |

`webfetch` supports `mode: "auto" | "main" | "full"` for HTML. `auto` uses
substantial main content when available and safely falls back to the complete
page. `main` requires successful focused extraction. `full` always includes the
whole body, including navigation and sidebars. Focused results state that
`mode="full"` can recover omitted surrounding content.

Search results are intentionally not cached, so repeated calls always contact
the configured providers.

## Testing

```bash
pnpm lint
pnpm test
pnpm typecheck
```

The web tests cover search-engine HTML parsing, URL validation, native fetching,
automatic/full HTML extraction, charset and base-URL handling, redirects,
private-network blocking, transient retries, bounded caching and output,
content-aware size limits, Markdown links, XML feeds, PDF text/metadata/links,
and pagination.

## Research notes

- SearXNG's DuckDuckGo engine docs describe the no-JavaScript endpoint and
  CAPTCHA detection: https://docs.searxng.org/dev/engines/online/duckduckgo.html
