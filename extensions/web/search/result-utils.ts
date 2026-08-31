import type { SearchResult } from "./result.ts";

const TRACKING_PARAMETERS = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

function isTrackingParameter(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMETERS.has(normalized);
}

function contentHint(url: URL): string | undefined {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".pdf")) return "PDF";
  if (path.endsWith(".json")) return "JSON";
  if (
    url.hostname === "github.com" ||
    url.hostname.endsWith(".github.com") ||
    url.hostname === "raw.githubusercontent.com"
  ) {
    return "GitHub";
  }
  if (
    url.hostname.startsWith("docs.") ||
    url.hostname === "developer.mozilla.org" ||
    /\/(?:docs?|documentation|reference|api)(?:\/|$)/.test(path)
  ) {
    return "documentation";
  }
  return undefined;
}

function preferDirectContent(url: URL): URL {
  if (url.hostname !== "github.com") return url;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") return url;
  url.hostname = "raw.githubusercontent.com";
  url.pathname = `/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`;
  url.search = "";
  return url;
}

function canonicalUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (isTrackingParameter(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return preferDirectContent(url);
  } catch {
    return null;
  }
}

function dedupeKey(url: URL): string {
  const port = url.port ? `:${url.port}` : "";
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return `${url.hostname.toLowerCase()}${port}${path}${url.search}`;
}

function siteDomain(query: string): string | undefined {
  const value = query.match(/(?:^|\s)site:([^\s]+)/i)?.[1];
  if (!value) return undefined;
  try {
    return new URL(`https://${value.replace(/^\*\./, "")}`).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return undefined;
  }
}

export interface NormalizedDomainFilters {
  allowed: string[];
  blocked: string[];
}

export function normalizeDomain(value: string): string | null {
  let input = value.trim().toLowerCase();
  if (!input) return null;
  if (input.startsWith("-")) input = input.slice(1).trim();
  if (!input) return null;
  try {
    const parsed = input.includes("://")
      ? new URL(input)
      : new URL(`https://${input}`);
    input = parsed.hostname;
  } catch {
    input = input.split("/")[0]?.split(":")[0] ?? "";
  }
  input = input.replace(/^www\./i, "").replace(/^\.+|\.+$/g, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input) ? input : null;
}

export function normalizeDomainFilters(
  domains?: readonly string[],
): NormalizedDomainFilters {
  const filters: NormalizedDomainFilters = { allowed: [], blocked: [] };
  if (!domains?.length) return filters;

  for (const raw of domains) {
    const isBlocked = raw.trim().startsWith("-");
    const domain = normalizeDomain(raw);
    if (!domain) continue;
    const target = isBlocked ? filters.blocked : filters.allowed;
    if (!target.includes(domain)) target.push(domain);
  }

  return filters;
}

export function matchesDomainFilters(
  hostname: string | undefined,
  filters: NormalizedDomainFilters,
): boolean {
  if (filters.allowed.length === 0 && filters.blocked.length === 0) return true;
  if (!hostname) return false;
  if (
    filters.allowed.length > 0 &&
    !filters.allowed.some((domain) => matchesSite(hostname, domain))
  ) {
    return false;
  }
  return !filters.blocked.some((domain) => matchesSite(hostname, domain));
}

function matchesSite(hostname: string | undefined, domain: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.replace(/^www\./i, "").toLowerCase();
  if (domain === "github.com" && normalized === "raw.githubusercontent.com") {
    return true;
  }
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

export function filterResultsForQuery(
  results: SearchResult[],
  query: string,
  domains?: readonly string[],
): SearchResult[] {
  const domain = siteDomain(query);
  const domainFilters = normalizeDomainFilters(domains);
  if (
    !domain &&
    domainFilters.allowed.length === 0 &&
    domainFilters.blocked.length === 0
  ) {
    return results;
  }
  return results.filter((result) => {
    const url = canonicalUrl(result.url);
    if (!url) return false;
    if (domain && !matchesSite(url.hostname, domain)) return false;
    return matchesDomainFilters(url.hostname, domainFilters);
  });
}

export function normalizeResults(
  results: SearchResult[],
  source: string,
): SearchResult[] {
  return results.flatMap((result): SearchResult[] => {
    const url = canonicalUrl(result.url);
    if (!url) return [];
    return [
      {
        ...result,
        url: url.href,
        hostname: url.hostname,
        source,
        contentHint: contentHint(url),
      },
    ];
  });
}

export function mergeResults(
  current: SearchResult[],
  incoming: SearchResult[],
  query: string,
  limit: number,
  domains?: readonly string[],
): SearchResult[] {
  const byUrl = new Map<string, SearchResult>();
  for (const result of filterResultsForQuery(
    [...current, ...incoming],
    query,
    domains,
  )) {
    const url = canonicalUrl(result.url);
    if (!url) continue;
    const key = dedupeKey(url);
    const previous = byUrl.get(key);
    if (
      !previous ||
      (previous.url.startsWith("http:") && url.protocol === "https:")
    ) {
      byUrl.set(key, { ...result, url: url.href });
    }
  }

  return [...byUrl.values()].slice(0, limit);
}
