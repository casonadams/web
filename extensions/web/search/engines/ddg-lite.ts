import { parseHTML } from "linkedom";
import { config } from "../../config.ts";
import type { SearchResult } from "../result.ts";
import { searchHtml } from "./html.ts";
import type { SearchEngine } from "./types.ts";
import { strip } from "./utils.ts";

function decodeDdgUrl(href: string): string | undefined {
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href);
    return url.searchParams.get("uddg") ?? url.href;
  } catch {
    return undefined;
  }
}

/** Parse DuckDuckGo Lite HTML (`a.result-link` + `.result-snippet`). */
export function parseDdgLiteHtml(html: string): SearchResult[] {
  const { document } = parseHTML(html);
  const results: SearchResult[] = [];
  for (const anchor of document.querySelectorAll("a.result-link")) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const url = decodeDdgUrl(href);
    if (!url) continue;
    const snippet = anchor
      .closest("tr")
      ?.nextElementSibling?.querySelector(".result-snippet");
    results.push({
      title: anchor.textContent?.trim() ?? "",
      abstract: snippet?.textContent ? strip(snippet.textContent) : "",
      url,
    });
  }
  return results;
}

export const ddgLiteEngine: SearchEngine = {
  name: "DuckDuckGo Lite",
  search: (query, signal) =>
    searchHtml(
      (q) =>
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}&kl=${encodeURIComponent(config.region)}`,
      parseDdgLiteHtml,
      query,
      signal,
    ),
};
