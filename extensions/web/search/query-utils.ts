function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

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
