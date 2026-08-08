/** A single normalized search result from any provider. */
export interface SearchResult {
  title: string;
  abstract: string;
  url: string;
  hostname?: string;
  source?: string;
  contentHint?: string;
}
