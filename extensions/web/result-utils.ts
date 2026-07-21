import type { DdgResult } from "./ddg-parser.ts";

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

function matchesSite(hostname: string | undefined, domain: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.replace(/^www\./i, "").toLowerCase();
  if (domain === "github.com" && normalized === "raw.githubusercontent.com") {
    return true;
  }
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

export function filterResultsForQuery(
  results: DdgResult[],
  query: string,
): DdgResult[] {
  const domain = siteDomain(query);
  if (!domain) return results;
  return results.filter((result) => {
    const url = canonicalUrl(result.url);
    return url ? matchesSite(url.hostname, domain) : false;
  });
}

export function normalizeResults(
  results: DdgResult[],
  source: string,
): DdgResult[] {
  return results.flatMap((result): DdgResult[] => {
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
  current: DdgResult[],
  incoming: DdgResult[],
  query: string,
  limit: number,
): DdgResult[] {
  const byUrl = new Map<string, DdgResult>();
  for (const result of filterResultsForQuery(
    [...current, ...incoming],
    query,
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
