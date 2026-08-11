# Web Extension

A pi extension package with two tools:

- **`websearch`** searches the web and returns result summaries.
- **`webfetch`** fetches a URL and returns its content as clean text.

Both are TypeScript and need no subprocess, browser, or API key. For anything
beyond that, read the code under `extensions/web/`.

## Install

```bash
pi install git:github.com/casonadams/web
```

For a one-off run:

```bash
pi -e git:github.com/casonadams/web
```

## Supported content

`webfetch` handles HTML, Markdown, JSON, CSV/TSV, XML, RSS/Atom feeds, sitemaps,
text-based PDFs, and plain text. It takes `mode: "auto" | "main" | "full"` to
choose between focused and whole-page HTML extraction.

`websearch` rotates across several keyless providers and falls back to the next
one when a provider fails or returns nothing.

Non-public addresses (loopback, private, link-local, reserved) are blocked by
default, including on redirects. See [SECURITY.md](SECURITY.md).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_MAX_RESULTS` | `5` | Default search results (tool maximum is 10) |
| `WEB_SEARCH_TIMEOUT` | `12` | Timeout per search provider in seconds |
| `WEB_SEARCH_TOTAL_TIMEOUT` | `30` | End-to-end timeout for all search providers in seconds |
| `WEB_SEARCH_BACKOFF_MS` | `500` | Delay between engine attempts after a failure; a `Retry-After` header overrides it |
| `WEB_SEARCH_MIN_INTERVAL_MS` | `2000` | Minimum delay between the starts of separate search calls |
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

Search results are intentionally not cached, so repeated calls always contact
the providers.

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately as
described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
