import { config } from "../../config.ts";
import { fetchText } from "../../http/http.ts";
import type { SearchResult } from "../result.ts";
import type { SearchEngine } from "./types.ts";

interface FirecrawlResponse {
  success?: unknown;
  data?: {
    web?: unknown;
  };
  error?: unknown;
}

export function parseFirecrawlResponse(body: string): SearchResult[] {
  const response = JSON.parse(body) as FirecrawlResponse;
  if (response.success === false) {
    throw new Error(
      typeof response.error === "string" ? response.error : "search failed",
    );
  }
  if (!Array.isArray(response.data?.web)) return [];

  return response.data.web.flatMap((result) => {
    if (
      typeof result !== "object" ||
      result === null ||
      !("url" in result) ||
      typeof result.url !== "string"
    ) {
      return [];
    }
    return [
      {
        title:
          "title" in result && typeof result.title === "string"
            ? result.title
            : "",
        abstract:
          "description" in result && typeof result.description === "string"
            ? result.description
            : "",
        url: result.url,
      },
    ];
  });
}

export const firecrawlEngine: SearchEngine = {
  name: "Firecrawl",
  async search(query, signal) {
    const response = await fetchText("https://api.firecrawl.dev/v2/search", {
      timeoutSec: config.searchTimeout,
      maxBytes: config.searchMaxBytes,
      allowPrivateNetwork: config.allowPrivateNetwork,
      retries: config.httpRetries,
      signal,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 10, sources: ["web"] }),
    });
    return parseFirecrawlResponse(response.body);
  },
};
