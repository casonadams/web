import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type {
  WebFetchDetails,
  WebFetchInput,
  WebSearchDetails,
  WebSearchInput,
} from "./tool-contracts.ts";

type RenderResult = { content?: unknown; details?: unknown };
type RenderOptions = { isPartial: boolean };
type RenderContext = { isError?: boolean };
type TextBlock = { type: "text"; text?: string };

export function renderSearchCall(args: WebSearchInput, theme: Theme): Text {
  return new Text(
    theme.fg("toolTitle", theme.bold("websearch ")) +
      theme.fg("accent", args.query),
    0,
    0,
  );
}

function isTextBlock(value: unknown): value is TextBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text"
  );
}

function errorText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(isTextBlock)
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

export function renderSearchResult(
  result: RenderResult,
  { isPartial }: RenderOptions,
  theme: Theme,
  context?: RenderContext,
): Text {
  if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);
  if (context?.isError) {
    const message = errorText(result.content);
    const label = message ? `search failed: ${message}` : "Search failed";
    return new Text(theme.fg("error", label), 0, 0);
  }
  const details = result.details as WebSearchDetails | undefined;
  const count = details?.count ?? 0;
  const engine = details?.engine ? ` via ${details.engine}` : "";
  const label = `${count} result${count !== 1 ? "s" : ""}${engine}`;
  return new Text(theme.fg("success", label), 0, 0);
}

export function renderFetchCall(args: WebFetchInput, theme: Theme): Text {
  return new Text(
    theme.fg("toolTitle", theme.bold("webfetch ")) +
      theme.fg("accent", args.url),
    0,
    0,
  );
}

export function renderFetchResult(
  result: RenderResult,
  { isPartial }: RenderOptions,
  theme: Theme,
  context?: RenderContext,
): Text {
  if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
  const details = result.details as WebFetchDetails | undefined;
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
