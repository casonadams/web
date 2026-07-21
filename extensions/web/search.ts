import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { config } from "./config.ts";
import { type DdgResult, parseDdgLite } from "./ddg-parser.ts";
import { requestSignal } from "./http.ts";
import { formatSearchResults } from "./logic.ts";
import { type LynxExecutor, lynxDump } from "./lynx.ts";
import { relaxedSearchQueries } from "./query-utils.ts";
import {
  filterResultsForQuery,
  mergeResults,
  normalizeResults,
} from "./result-utils.ts";
import {
  searchMarginalia,
  searchMwmbl,
  searchSearxng,
} from "./search-providers.ts";

const DDG_LITE = "https://lite.duckduckgo.com/lite/";

export interface SearchResponse {
  engine: string;
  results: DdgResult[];
  warnings: string[];
}

async function searchDdg(
  pi: ExtensionAPI,
  query: string,
  signal: AbortSignal,
  lynxExecutor?: LynxExecutor,
): Promise<DdgResult[]> {
  const queries = [query, ...relaxedSearchQueries(query)];
  for (const candidate of queries) {
    const url = `${DDG_LITE}?q=${encodeURIComponent(candidate)}&kl=${encodeURIComponent(config.region)}`;
    const output = await lynxDump(
      pi,
      url,
      config.searchTimeout,
      signal,
      config.searchMaxBytes,
      lynxExecutor,
    );
    const results = parseDdgLite(output, {
      minSnippetChars: config.minSnippetChars,
    });
    if (results.length > 0) return results;
    const unfilteredResults = parseDdgLite(output, { minSnippetChars: 0 });
    if (
      unfilteredResults.length > 0 ||
      /\bNo results found for\b/i.test(output)
    ) {
      return [];
    }
  }
  return [];
}

export async function searchWeb(
  pi: ExtensionAPI,
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
  lynxExecutor?: LynxExecutor,
): Promise<SearchResponse> {
  signal?.throwIfAborted();
  const operationSignal = requestSignal(config.searchTotalTimeout, signal);
  const attempts: Array<
    [string, (attemptSignal: AbortSignal) => Promise<DdgResult[]>]
  > = [
    [
      "DuckDuckGo via lynx",
      (attemptSignal) => searchDdg(pi, query, attemptSignal, lynxExecutor),
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
    signal?.throwIfAborted();
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
      const incoming = filterResultsForQuery(
        normalizeResults(await search(attemptSignal), engine),
        query,
      );
      if (incoming.length === 0) {
        errors.push(`${engine}: no results`);
        continue;
      }
      engines.push(engine);
      results = mergeResults(results, incoming, query, limit);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
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
