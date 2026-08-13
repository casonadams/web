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
| `WEB_REGION` | `wt-wt` | DuckDuckGo region code, such as `us-en` |
| `WEB_ALLOW_PRIVATE_NETWORK` | `false` | Permit local/private destinations |

The tools use fixed timeouts and resource limits: search requests are limited
to 2 MB, non-PDF fetches to 5 MB, PDFs to 20 MB, and returned text to 45 KB.
Network fetches time out after 8 seconds, and PDF extraction after 15 seconds.
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
