import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { SearchResult } from "./search/result.ts";

export type { SearchResult };

// ── Shared types ──────────────────────────────────────────────────────────────

export type SearchCallArgs = { query: string };
export type FetchCallArgs = {
  url: string;
  mode?: "auto" | "main" | "full";
};
export type SearchResultDetails = { count: number; engine?: string };
export type FetchResultDetails = {
  sourceUrl: string;
  finalUrl?: string;
  extraction?:
    | "main"
    | "full"
    | "pdf"
    | "json"
    | "markdown"
    | "xml"
    | "csv"
    | "text";
};

// ── Renderers ─────────────────────────────────────────────────────────────────

export function renderSearchCall(args: SearchCallArgs, theme: Theme) {
  return new Text(
    theme.fg("toolTitle", theme.bold("websearch ")) +
      theme.fg("accent", args.query),
    0,
    0,
  );
}

function errorText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "text",
    )
    .map((block) => (block as { text?: string }).text ?? "")
    .join("\n")
    .trim();
}

export function renderSearchResult(
  result: { content?: unknown; details?: unknown },
  { isPartial }: { isPartial: boolean },
  theme: Theme,
  context?: { isError?: boolean },
) {
  if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
  if (context?.isError) {
    const message = errorText(result.content);
    const label = message ? `search failed: ${message}` : "Search failed";
    return new Text(theme.fg("error", label), 0, 0);
  }
  const details = result.details as SearchResultDetails | undefined;
  const count = details?.count ?? 0;
  const engine = details?.engine ? ` via ${details.engine}` : "";
  const label = `${count} result${count !== 1 ? "s" : ""}${engine}`;
  return new Text(theme.fg("success", label), 0, 0);
}

export function renderFetchCall(args: FetchCallArgs, theme: Theme) {
  return new Text(
    theme.fg("toolTitle", theme.bold("webfetch ")) +
      theme.fg("accent", args.url),
    0,
    0,
  );
}

export function renderFetchResult(
  result: { details?: unknown },
  { isPartial }: { isPartial: boolean },
  theme: Theme,
  context?: { isError?: boolean },
) {
  if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
  const details = result.details as FetchResultDetails | undefined;
  const url = details?.sourceUrl;
  if (context?.isError) {
    const label = url ? `fetch failed ${url}` : "Fetch failed";
    return new Text(theme.fg("error", label), 0, 0);
  }
  if (!url) return new Text(theme.fg("warning", "No content"), 0, 0);
  const extraction = details.extraction ? ` (${details.extraction})` : "";
  const destination =
    details.finalUrl && details.finalUrl !== url
      ? `${url} -> ${details.finalUrl}`
      : url;
  return new Text(
    theme.fg("success", `fetched${extraction} `) + theme.fg("dim", destination),
    0,
    0,
  );
}

// ── Output formatters ─────────────────────────────────────────────────────────

function formatResult(result: SearchResult, index: number): string {
  const signals = [result.hostname, result.contentHint, result.source].filter(
    Boolean,
  );
  const metadata = signals.length > 0 ? ` (${signals.join(" | ")})` : "";
  const snippet = result.abstract ? `\n   ${result.abstract}` : "";
  return `${index + 1}. **${result.title}**${metadata}${snippet}\n   ${result.url}`;
}

export function formatSearchResults(
  query: string,
  results: SearchResult[],
): string {
  if (!results.length) return `No results found for: ${query}`;
  return `**Search results for:** ${query}\n\n${results.map(formatResult).join("\n\n")}`;
}
