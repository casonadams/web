import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { config } from "./config.ts";
import { type DdgResult, parseDdgLite } from "./ddg-parser.ts";
import { fetchText, requestSignal } from "./http.ts";
import { formatSearchResults } from "./logic.ts";
import { lynxDump } from "./lynx.ts";
import { parseMwmblResults } from "./mwmbl-parser.ts";
import { relaxedSearchQueries } from "./query-utils.ts";
import { mergeResults, normalizeResults } from "./result-utils.ts";

const DDG_LITE = "https://lite.duckduckgo.com/lite/";
const MARGINALIA_API = "https://api2.marginalia-search.com/search";

export interface SearchResponse {
  engine: string;
  results: DdgResult[];
  warnings: string[];
}

interface JsonResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  description?: unknown;
}

function normalizeJsonResults(value: unknown): DdgResult[] {
  if (!value || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item): DdgResult[] => {
    if (!item || typeof item !== "object") return [];
    const result = item as JsonResult;
    if (typeof result.title !== "string" || typeof result.url !== "string") {
      return [];
    }
    const abstract =
      typeof result.content === "string"
        ? result.content
        : typeof result.description === "string"
          ? result.description
          : "";
    if (!/^https?:\/\//i.test(result.url)) return [];
    return [{ title: result.title, abstract, url: result.url }];
  });
}

async function searchDdg(
  pi: ExtensionAPI,
  query: string,
  signal: AbortSignal | undefined,
): Promise<DdgResult[]> {
  const queries = [query, ...relaxedSearchQueries(query)];
  let lastError: unknown;
  for (const candidate of queries) {
    try {
      const url = `${DDG_LITE}?q=${encodeURIComponent(candidate)}&kl=${encodeURIComponent(config.region)}`;
      const output = await lynxDump(pi, url, config.searchTimeout, signal);
      const results = parseDdgLite(output, {
        minSnippetChars: config.minSnippetChars,
      });
      if (results.length > 0) return results;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function searchSearxng(
  query: string,
  signal: AbortSignal | undefined,
): Promise<DdgResult[]> {
  if (!config.searxngUrl) return [];
  const url = new URL("search", `${config.searxngUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  const response = await fetchText(url.href, {
    timeoutSec: config.searchTimeout,
    maxBytes: config.searchMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
  });
  return normalizeJsonResults(JSON.parse(response.body));
}

async function searchMwmbl(
  query: string,
  signal: AbortSignal | undefined,
): Promise<DdgResult[]> {
  const url = new URL(config.mwmblUrl);
  url.searchParams.set("s", query);
  const response = await fetchText(url.href, {
    timeoutSec: config.searchTimeout,
    maxBytes: config.searchMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
  });
  return parseMwmblResults(JSON.parse(response.body));
}

async function searchMarginalia(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<DdgResult[]> {
  const url = new URL(MARGINALIA_API);
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("nsfw", "1");
  const response = await fetchText(url.href, {
    timeoutSec: config.searchTimeout,
    maxBytes: config.searchMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
    headers: { "api-key": config.marginaliaKey },
  });
  return normalizeJsonResults(JSON.parse(response.body));
}

export async function searchWeb(
  pi: ExtensionAPI,
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<SearchResponse> {
  const operationSignal = requestSignal(config.searchTotalTimeout, signal);
  const attempts: Array<
    [string, (attemptSignal: AbortSignal) => Promise<DdgResult[]>]
  > = [
    [
      "DuckDuckGo via lynx",
      (attemptSignal) => searchDdg(pi, query, attemptSignal),
    ],
  ];
  if (config.searxngUrl) {
    attempts.push([
      "SearXNG",
      (attemptSignal) => searchSearxng(query, attemptSignal),
    ]);
  }
  attempts.push([
    "Mwmbl",
    (attemptSignal) => searchMwmbl(query, attemptSignal),
  ]);
  if (config.marginaliaKey) {
    attempts.push([
      "Marginalia",
      (attemptSignal) => searchMarginalia(query, limit, attemptSignal),
    ]);
  }

  const errors: string[] = [];
  const engines: string[] = [];
  const timeoutMessage = `search timed out after ${config.searchTotalTimeout}s`;
  let results: DdgResult[] = [];
  for (const [engine, search] of attempts) {
    if (results.length >= limit) break;
    if (operationSignal.aborted) {
      if (results.length > 0) {
        errors.push(timeoutMessage);
        break;
      }
      throw new Error(timeoutMessage);
    }
    try {
      const attemptSignal = requestSignal(
        config.searchTimeout,
        operationSignal,
      );
      const incoming = normalizeResults(await search(attemptSignal), engine);
      if (incoming.length === 0) {
        errors.push(`${engine}: no results`);
        continue;
      }
      engines.push(engine);
      results = mergeResults(results, incoming, query, limit);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (operationSignal.aborted) {
        if (results.length > 0) {
          errors.push(timeoutMessage);
          break;
        }
        throw new Error(timeoutMessage);
      }
      errors.push(
        `${engine}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (results.length > 0) {
    return { engine: engines.join(" + "), results, warnings: errors };
  }
  throw new Error(errors.join("; "));
}

export { formatSearchResults };
