import type { SearchResult } from "./result.ts";

const MAX_QUERY_BYTES = 500;
const MAX_TITLE_BYTES = 200;
const MAX_SNIPPET_BYTES = 600;
export const MAX_SEARCH_OUTPUT_BYTES = 8_000;

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function truncateText(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value;
  const suffix = "...";
  const contentLimit = maxBytes - byteLength(suffix);
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = byteLength(character);
    if (bytes + characterBytes > contentLimit) break;
    output += character;
    bytes += characterBytes;
  }
  return `${output.trimEnd()}${suffix}`;
}

function resultTitle(result: SearchResult, index: number): string {
  const signals = [result.hostname, result.contentHint, result.source].filter(
    Boolean,
  );
  const metadata = signals.length > 0 ? ` (${signals.join(" | ")})` : "";
  return `${index + 1}. **${truncateText(result.title, MAX_TITLE_BYTES)}**${metadata}`;
}

function renderResults(
  header: string,
  results: SearchResult[],
  snippets: string[],
  statusNotice?: string,
): string {
  const affected = snippets.filter(
    (snippet, index) => snippet !== results[index]?.abstract,
  ).length;
  const blocks = results.map((result, index) =>
    [
      resultTitle(result, index),
      snippets[index] ? `   ${snippets[index]}` : undefined,
      `   ${result.url}`,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n"),
  );
  const notices = [
    statusNotice,
    affected > 0
      ? `[Truncated snippets for ${affected} of ${results.length} search results.]`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const suffix = notices.length > 0 ? `\n\n${notices.join("\n")}` : "";
  return `${header}\n\n${blocks.join("\n\n")}${suffix}`;
}

function renderUrls(
  header: string,
  results: SearchResult[],
  statusNotice?: string,
): string {
  const urls = results.map((result, index) => `${index + 1}. ${result.url}`);
  const notices = [
    statusNotice,
    "[Titles and snippets omitted to preserve complete URLs.]",
  ].filter((value): value is string => Boolean(value));
  return `${header}\n\n${urls.join("\n")}\n\n${notices.join("\n")}`;
}

export function formatSearchResults(
  query: string,
  results: SearchResult[],
  statusNotice?: string,
): string {
  const boundedQuery = truncateText(query, MAX_QUERY_BYTES);
  if (!results.length) return `No results found for: ${boundedQuery}`;

  const header = `**Search results for:** ${boundedQuery}`;
  const boundedStatus = statusNotice
    ? truncateText(statusNotice, MAX_QUERY_BYTES)
    : undefined;
  const snippets = results.map((result) =>
    result.abstract ? truncateText(result.abstract, MAX_SNIPPET_BYTES) : "",
  );
  let output = renderResults(header, results, snippets, boundedStatus);
  for (let index = snippets.length - 1; index >= 0; index -= 1) {
    if (byteLength(output) <= MAX_SEARCH_OUTPUT_BYTES) return output;
    snippets[index] = "";
    output = renderResults(header, results, snippets, boundedStatus);
  }
  return byteLength(output) <= MAX_SEARCH_OUTPUT_BYTES
    ? output
    : renderUrls(header, results, boundedStatus);
}
