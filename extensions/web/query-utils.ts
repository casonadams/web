function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

/**
 * Build conservative fallback queries for search-engine error pages. The exact
 * query is always attempted first; callers use these variants only when the
 * search engine returns an unrecognized error response.
 */
export function relaxedSearchQueries(query: string): string[] {
  const exact = cleanQuery(query);
  const candidates = [
    exact.replace(/["“”]/g, ""),
    exact.replace(
      /\b(?:number of|how many|what is|please|find|search for|show me)\b/gi,
      " ",
    ),
  ].map(cleanQuery);

  return [...new Set(candidates)].filter(
    (candidate) => candidate && candidate !== exact,
  );
}
