import { config } from "../../config.ts";
import { fetchText } from "../../http/http.ts";
import type { SearchResult } from "../result.ts";
import type { SearchEngine } from "./types.ts";

interface MwmblFragment {
  value?: unknown;
}

interface MwmblResult {
  title?: unknown;
  url?: unknown;
  extract?: unknown;
}

function fragmentText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((fragment) =>
      fragment &&
      typeof fragment === "object" &&
      typeof (fragment as MwmblFragment).value === "string"
        ? (fragment as MwmblFragment).value
        : "",
    )
    .join("")
    .trim();
}

export function parseMwmblResults(value: unknown): SearchResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SearchResult[] => {
    if (!item || typeof item !== "object") return [];
    const result = item as MwmblResult;
    if (typeof result.url !== "string" || !/^https?:\/\//i.test(result.url)) {
      return [];
    }
    const title = fragmentText(result.title);
    if (!title) return [];
    return [{ title, abstract: fragmentText(result.extract), url: result.url }];
  });
}

export const mwmblEngine: SearchEngine = {
  name: "Mwmbl",
  search: async (query, signal) => {
    const url = new URL(config.mwmblUrl);
    url.searchParams.set("s", query);
    const response = await fetchText(url.href, {
      timeoutSec: config.searchTimeout,
      maxBytes: config.searchMaxBytes,
      allowPrivateNetwork: config.allowPrivateNetwork,
      retries: config.httpRetries,
      signal,
    });
    return parseMwmblResults(JSON.parse(response.body));
  },
};
