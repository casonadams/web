import { normalizeDomainFilters } from "./result-utils.ts";

function cleanQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

export function buildSearchQueryWithFilters(
  query: string,
  domains?: readonly string[],
): string {
  const cleaned = cleanQuery(query);
  if (!domains?.length) return cleaned;
  const filters = normalizeDomainFilters(domains);
  const parts = [cleaned];

  if (filters.allowed.length === 1 && !/(?:^|\s)site:/i.test(cleaned)) {
    parts.push(`site:${filters.allowed[0]}`);
  } else if (filters.allowed.length > 1 && !/(?:^|\s)site:/i.test(cleaned)) {
    parts.push(filters.allowed.map((d) => `site:${d}`).join(" OR "));
  }

  for (const blocked of filters.blocked) {
    if (!cleaned.includes(`-site:${blocked}`)) {
      parts.push(`-site:${blocked}`);
    }
  }

  return parts.join(" ").trim();
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
