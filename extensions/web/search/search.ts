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

interface AttemptContext {
  query: string;
  limit: number;
  signal: AbortSignal | undefined;
  operationSignal: AbortSignal;
  timeoutMessage: string;
}

interface AttemptState {
  errors: string[];
  engines: string[];
  results: SearchResult[];
}

function handleSearchTimeout(
  context: AttemptContext,
  state: AttemptState,
): void {
  if (state.results.length === 0) throw new Error(context.timeoutMessage);
  state.errors.push(context.timeoutMessage);
}

async function waitBeforeRetry(
  error: unknown,
  context: AttemptContext,
): Promise<void> {
  const backoff = retryAfterMs(error) ?? config.searchBackoffMs;
  if (backoff <= 0) return;
  try {
    await delay(backoff, undefined, { signal: context.operationSignal });
  } catch (delayError) {
    if (!context.operationSignal.aborted) throw delayError;
  }
}

async function recoverAttempt(
  error: unknown,
  engine: string,
  hasAnotherAttempt: boolean,
  context: AttemptContext,
  state: AttemptState,
): Promise<boolean> {
  if (context.signal?.aborted) throw context.signal.reason;
  if (context.operationSignal.aborted) {
    handleSearchTimeout(context, state);
    return false;
  }
  state.errors.push(
    `${engine}: ${error instanceof Error ? error.message : String(error)}`,
  );
  if (hasAnotherAttempt && state.results.length < context.limit) {
    await waitBeforeRetry(error, context);
  }
  return true;
}

async function runSearchAttempt(
  attempt: SearchAttempt,
  hasAnotherAttempt: boolean,
  context: AttemptContext,
  state: AttemptState,
): Promise<boolean> {
  const [engine, search] = attempt;
  try {
    const attemptSignal = requestSignal(
      config.searchTimeout,
      context.operationSignal,
    );
    const incoming = filterResultsForQuery(
      normalizeResults(await search(attemptSignal), engine),
      context.query,
    );
    if (incoming.length === 0) {
      state.errors.push(`${engine}: no results`);
      return true;
    }
    state.engines.push(engine);
    state.results = mergeResults(
      state.results,
      incoming,
      context.query,
      context.limit,
    );
    return true;
  } catch (error) {
    return recoverAttempt(error, engine, hasAnotherAttempt, context, state);
  }
}

export async function searchWithAttempts(
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
  attempts: readonly SearchAttempt[],
): Promise<SearchResponse> {
  signal?.throwIfAborted();
  const context: AttemptContext = {
    query,
    limit,
    signal,
    operationSignal: requestSignal(config.searchTotalTimeout, signal),
    timeoutMessage: `search timed out after ${config.searchTotalTimeout}s`,
  };
  const state: AttemptState = { errors: [], engines: [], results: [] };

  for (const [index, attempt] of attempts.entries()) {
    signal?.throwIfAborted();
    if (state.results.length >= limit) break;
    if (context.operationSignal.aborted) {
      handleSearchTimeout(context, state);
      break;
    }
    const shouldContinue = await runSearchAttempt(
      attempt,
      index < attempts.length - 1,
      context,
      state,
    );
    if (!shouldContinue) break;
  }
  if (state.results.length === 0) throw new Error(state.errors.join("; "));
  return {
    engine: state.engines.join(" + "),
    results: state.results,
    warnings: state.errors,
  };
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
