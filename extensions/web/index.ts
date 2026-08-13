import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { config } from "./config.ts";
import { fetchPage } from "./fetch/fetch.ts";
import { isHttpUrl } from "./http/url-utils.ts";
import {
  renderFetchCall,
  renderFetchResult,
  renderSearchCall,
  renderSearchResult,
} from "./renderers.ts";
import { formatSearchResults, searchWeb } from "./search/search.ts";
import {
  DEFAULT_SEARCH_LIMIT,
  type WebFetchDetails,
  type WebSearchDetails,
  webFetchParameters,
  webSearchParameters,
} from "./tool-contracts.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: "Search the web and return a list of result summaries.",
    promptGuidelines: ["Prefer websearch for finding public web pages."],
    parameters: webSearchParameters,
    renderCall: renderSearchCall,
    renderResult: renderSearchResult,
    async execute(_toolCallId, params, signal) {
      const limit = params.limit ?? DEFAULT_SEARCH_LIMIT;
      const { engine, results, warnings } = await searchWeb(
        params.query,
        limit,
        signal,
      );
      const warning =
        results.length < limit && warnings.length > 0
          ? `[Returned ${results.length} of ${limit} requested results. ${warnings.join("; ")}]`
          : undefined;
      return {
        content: [
          {
            type: "text",
            text: formatSearchResults(params.query, results, warning),
          },
        ],
        details: {
          count: results.length,
          engine,
        } satisfies WebSearchDetails,
      };
    },
  });

  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description:
      "Fetch HTML, XHTML, Markdown, RSS/Atom/RDF feeds, XML sitemaps, JSON, CSV/TSV, text, or PDF content from a URL and return clean text.",
    promptGuidelines: [
      "Prefer webfetch for reading public URLs; use raw HTTP tools for custom requests and browser tools for JavaScript or interaction.",
    ],
    parameters: webFetchParameters,
    renderCall: renderFetchCall,
    renderResult: renderFetchResult,
    async execute(_toolCallId, params, signal) {
      if (!isHttpUrl(params.url)) {
        throw new Error("Fetch blocked: only http and https URLs are allowed.");
      }
      const { content, extraction, finalUrl } = await fetchPage(
        params.url,
        params.offset ?? 1,
        params.limit ?? config.fetchLimit,
        params.mode ?? "auto",
        signal,
      );
      return {
        content: [{ type: "text", text: content || "No content returned." }],
        details: {
          sourceUrl: params.url,
          finalUrl,
          extraction,
        } satisfies WebFetchDetails,
      };
    },
  });
}
