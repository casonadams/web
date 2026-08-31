import type { SearchRecency } from "../../tool-contracts.ts";
import type { SearchResult } from "../result.ts";

export interface SearchExecutionOptions {
  recency?: SearchRecency;
  domains?: readonly string[];
}

export interface SearchEngine {
  name: string;
  search: (
    query: string,
    signal: AbortSignal,
    options?: SearchExecutionOptions,
  ) => Promise<SearchResult[]>;
}
