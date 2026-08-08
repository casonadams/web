import { setTimeout as delay } from "node:timers/promises";
import { config } from "../config.ts";
import { requestSignal } from "../http/http.ts";
import { formatSearchResults } from "../logic.ts";
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

const MAX_BACKOFF_MS = 5000;

export function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = error.message.match(/retry-after:\s*(\d+)/i);
  if (!match) return undefined;
  const ms = Number(match[1]) * 1000;
  return Number.isFinite(ms) ? Math.min(ms, MAX_BACKOFF_MS) : undefined;
}

export async function searchWeb(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<SearchResponse> {
  signal?.throwIfAborted();
  const operationSignal = requestSignal(config.searchTotalTimeout, signal);
  const attempts: Array<
    [string, (attemptSignal: AbortSignal) => Promise<SearchResult[]>]
  > = shuffledEngines().map((engine) => [
    engine.name,
    (attemptSignal) => engine.search(query, attemptSignal),
  ]);

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
          } catch {
            // operationSignal aborted during backoff; the loop's abort check
            // returns partial results or throws the timeout message.
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

export { formatSearchResults };
