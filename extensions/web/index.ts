import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { config } from "./config.ts";
import { fetchPage } from "./fetch.ts";
import {
  type FetchResultDetails,
  renderFetchCall,
  renderFetchResult,
  renderSearchCall,
  renderSearchResult,
  type SearchResultDetails,
} from "./logic.ts";
import { formatSearchResults, searchWeb } from "./search.ts";
import { isHttpUrl } from "./url-utils.ts";

const MAX_SEARCH_RESULTS = 10;

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: "Search the web and return a list of result summaries.",
    promptSnippet: "Search the web for current information",
    promptGuidelines: [
      "Use websearch with targeted terms or site:domain queries when primary or official sources are preferable.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_SEARCH_RESULTS,
          description: `Maximum results to return (default ${Math.min(config.maxResults, MAX_SEARCH_RESULTS)})`,
        }),
      ),
    }),
    renderCall: renderSearchCall,
    renderResult: renderSearchResult,
    async execute(_toolCallId, params, signal) {
      const limit =
        params.limit ?? Math.min(config.maxResults, MAX_SEARCH_RESULTS);
      const { engine, results, warnings } = await searchWeb(
        pi,
        params.query,
        limit,
        signal,
      );
      const warning =
        results.length < limit && warnings.length > 0
          ? `\n\n[Returned ${results.length} of ${limit} requested results. ${warnings.join("; ")}]`
          : "";
      return {
        content: [
          {
            type: "text",
            text: `${formatSearchResults(params.query, results)}${warning}`,
          },
        ],
        details: {
          count: results.length,
          engine,
        } satisfies SearchResultDetails,
      };
    },
  });

  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description:
      "Fetch HTML, Markdown, RSS/Atom/XML, JSON, text, or PDF content from a URL and return clean text.",
    promptSnippet:
      "Fetch clean HTML, Markdown, XML feed, JSON, text, or PDF content from a URL",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      offset: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: "Line number to start from (1-indexed, default 1)",
        }),
      ),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: 2000,
          description: `Maximum number of lines to return (default ${config.fetchLimit})`,
        }),
      ),
      mode: Type.Optional(
        StringEnum(["auto", "main", "full"] as const, {
          description:
            'HTML extraction mode (default "auto"). Use "full" when navigation or sidebars matter.',
        }),
      ),
    }),
    renderCall: renderFetchCall,
    renderResult: renderFetchResult,
    async execute(_toolCallId, params, signal) {
      if (!isHttpUrl(params.url)) {
        return {
          content: [
            {
              type: "text",
              text: "Fetch blocked: only http and https URLs are allowed.",
            },
          ],
          details: { sourceUrl: params.url } satisfies FetchResultDetails,
        };
      }
      try {
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
          } satisfies FetchResultDetails,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { sourceUrl: params.url } satisfies FetchResultDetails,
        };
      }
    },
  });
}
