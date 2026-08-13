import type { SearchResult } from "../result.ts";

export interface SearchEngine {
  name: string;
  search: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
}
