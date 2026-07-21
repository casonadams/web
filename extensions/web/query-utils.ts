function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

/**
 * Build conservative fallback queries for search-engine error pages. The exact
 * query is always attempted first; these variants are used only when it yields
 * no parsed results.
 */
export function relaxedSearchQueries(query: string): string[] {
  const exact = cleanQuery(query);
  const candidates = [
    exact.replace(/["“”]/g, ""),
    exact.replace(
      /\b(?:number of|how many|what is|please|find|search for|show me)\b/gi,
      " ",
    ),
    exact.replace(/\bsite:([^\s]+)/gi, "$1"),
  ].map(cleanQuery);

  return [...new Set(candidates)].filter(
    (candidate) => candidate && candidate !== exact,
  );
}
