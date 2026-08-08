import type { SearchResult } from "../result.ts";

/** A search provider that returns normalized results. */
export interface SearchEngine {
  name: string;
  search: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
}
