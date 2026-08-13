# Web tools for pi

A pi extension that adds two tools without requiring an API key:

- `websearch` finds public web pages and returns result summaries.
- `webfetch` reads a public URL and returns clean, paginated text.

## Install

```bash
pi install git:github.com/casonadams/web
```

To try it without installing:

```bash
pi -e git:github.com/casonadams/web
```

## Tools

### `websearch`

Searches across several keyless providers and falls back when a provider is
unavailable or returns no results.

### `webfetch`

Reads HTML, XHTML, Markdown, JSON, CSV/TSV, XML, RSS/Atom/RDF feeds, sitemaps,
plain text, and text-based PDFs. HTML can be extracted as focused main content
or as a full page.

Local, private, and other non-public destinations are blocked by default,
including redirects. See [SECURITY.md](SECURITY.md) for details.

## Configuration

| Variable                    | Default | Purpose                                 |
| --------------------------- | ------- | --------------------------------------- |
| `WEB_REGION`                | `wt-wt` | DuckDuckGo region code, such as `us-en` |
| `WEB_ALLOW_PRIVATE_NETWORK` | `false` | Allow local and private destinations    |

## Development

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
security issues privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
