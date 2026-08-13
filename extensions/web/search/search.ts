import { setTimeout as delay } from "node:timers/promises";
import { createCoalescedOperation } from "../coalesced-operation.ts";
import { config } from "../config.ts";
import { requestSignal } from "../http/http.ts";
import { shuffledEngines } from "./engines/index.ts";
import type { SearchResult } from "./result.ts";
import {
  filterResultsForQuery,
  mergeResults,
  normalizeResults,
} from "./result-utils.ts";

export interface SearchResponse {
  engine: string;
  results: SearchResult[];
  warnings: string[];
}

type SearchFn = (
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
) => Promise<SearchResponse>;

type SearchAttempt = readonly [
  engine: string,
  search: (attemptSignal: AbortSignal) => Promise<SearchResult[]>,
];

const MAX_BACKOFF_MS = 5000;
const runCoalescedSearch = createCoalescedOperation<string, SearchResponse>();
let searchStartChain: Promise<void> = Promise.resolve();
let lastSearchStartMs = 0;

function throttleSearchStart(signal: AbortSignal | undefined): Promise<void> {
  const previous = searchStartChain;
  let release!: () => void;
  searchStartChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  return previous
    .catch(() => {})
    .then(async () => {
      try {
        const elapsed = Date.now() - lastSearchStartMs;
        const waitMs = config.searchMinIntervalMs - elapsed;
        if (waitMs > 0) {
          await delay(waitMs, undefined, { signal });
        }
        lastSearchStartMs = Date.now();
      } finally {
        release();
      }
    });
}

export function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const value = error.message.match(/retry-after:\s*([^)]+)/i)?.[1]?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(ms)
    ? Math.max(0, Math.min(ms, MAX_BACKOFF_MS))
    : undefined;
}

function searchKey(query: string, limit: number): string {
  return `${limit}:${query}`;
}

export async function searchWithAttempts(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
  attempts: readonly SearchAttempt[],
): Promise<SearchResponse> {
  signal?.throwIfAborted();
  const operationSignal = requestSignal(config.searchTotalTimeout, signal);

  const errors: string[] = [];
  const engines: string[] = [];
  const timeoutMessage = `search timed out after ${config.searchTotalTimeout}s`;
  let results: SearchResult[] = [];
  for (let i = 0; i < attempts.length; i += 1) {
    const [engine, search] = attempts[i];
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
      if (i < attempts.length - 1 && results.length < limit) {
        const backoff = retryAfterMs(error) ?? config.searchBackoffMs;
        if (backoff > 0) {
          try {
            await delay(backoff, undefined, { signal: operationSignal });
          } catch (error) {
            if (!operationSignal.aborted) throw error;
          }
        }
      }
    }
  }
  if (results.length > 0) {
    return { engine: engines.join(" + "), results, warnings: errors };
  }
  throw new Error(errors.join("; "));
}

async function doSearch(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<SearchResponse> {
  const attempts: SearchAttempt[] = shuffledEngines().map((engine) => [
    engine.name,
    (attemptSignal) => engine.search(query, attemptSignal),
  ]);
  return searchWithAttempts(query, limit, signal, attempts);
}

export async function searchWeb(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
  search: SearchFn = doSearch,
): Promise<SearchResponse> {
  return runCoalescedSearch(
    searchKey(query, limit),
    signal,
    async (sharedSignal) => {
      await throttleSearchStart(sharedSignal);
      return search(query, limit, sharedSignal);
    },
  );
}

export { formatSearchResults } from "./format.ts";
