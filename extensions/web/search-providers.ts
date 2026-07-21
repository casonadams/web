import { config } from "./config.ts";
import type { DdgResult } from "./ddg-parser.ts";
import { fetchText } from "./http.ts";
import { parseMwmblResults } from "./mwmbl-parser.ts";

const MARGINALIA_API = "https://api2.marginalia-search.com/search";

interface JsonResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  description?: unknown;
}

function normalizeJsonResults(value: unknown): DdgResult[] {
  if (!value || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item): DdgResult[] => {
    if (!item || typeof item !== "object") return [];
    const result = item as JsonResult;
    if (typeof result.title !== "string" || typeof result.url !== "string") {
      return [];
    }
    const abstract =
      typeof result.content === "string"
        ? result.content
        : typeof result.description === "string"
          ? result.description
          : "";
    if (!/^https?:\/\//i.test(result.url)) return [];
    return [{ title: result.title, abstract, url: result.url }];
  });
}

async function fetchProvider(url: URL, signal: AbortSignal): Promise<string> {
  const response = await fetchText(url.href, {
    timeoutSec: config.searchTimeout,
    maxBytes: config.searchMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
  });
  return response.body;
}

export async function searchSearxng(
  query: string,
  signal: AbortSignal,
): Promise<DdgResult[]> {
  if (!config.searxngUrl) return [];
  const url = new URL("search", `${config.searxngUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  return normalizeJsonResults(JSON.parse(await fetchProvider(url, signal)));
}

export async function searchMwmbl(
  query: string,
  signal: AbortSignal,
): Promise<DdgResult[]> {
  const url = new URL(config.mwmblUrl);
  url.searchParams.set("s", query);
  return parseMwmblResults(JSON.parse(await fetchProvider(url, signal)));
}

export async function searchMarginalia(
  query: string,
  limit: number,
  signal: AbortSignal,
): Promise<DdgResult[]> {
  const url = new URL(MARGINALIA_API);
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("nsfw", "1");
  const response = await fetchText(url.href, {
    timeoutSec: config.searchTimeout,
    maxBytes: config.searchMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
    headers: { "api-key": config.marginaliaKey },
  });
  return normalizeJsonResults(JSON.parse(response.body));
}
