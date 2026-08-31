import { parseHTML } from "linkedom";
import type { SearchResult } from "../result.ts";
import { searchHtml } from "./html.ts";
import type { SearchEngine } from "./types.ts";
import { strip } from "./utils.ts";

function decodeYahooUrl(href: string): string {
  const ru = href.match(/RU=([^/]+)/)?.[1];
  return ru ? decodeURIComponent(ru) : href;
}

export function parseYahooHtml(html: string): SearchResult[] {
  const { document } = parseHTML(html);
  const results: SearchResult[] = [];
  for (const block of document.querySelectorAll("div.algo-sr")) {
    const anchor = block.querySelector("a[href*='r.search.yahoo.com']");
    const href = anchor?.getAttribute("href");
    if (!href) continue;
    const snippet = block.querySelector(".compText");
    results.push({
      title: block.querySelector("h3")?.textContent?.trim() ?? "",
      abstract: snippet?.textContent ? strip(snippet.textContent) : "",
      url: decodeYahooUrl(href),
    });
  }
  return results;
}

const YAHOO_AGE_MAP: Record<string, string> = {
  day: "1d",
  week: "1w",
  month: "1m",
  year: "1y",
};

export const yahooEngine: SearchEngine = {
  name: "Yahoo",
  search: (query, signal, options) => {
    const ageParam =
      options?.recency && YAHOO_AGE_MAP[options.recency]
        ? `&age=${YAHOO_AGE_MAP[options.recency]}`
        : "";
    return searchHtml(
      (q) =>
        `https://search.yahoo.com/search?p=${encodeURIComponent(q)}${ageParam}`,
      parseYahooHtml,
      query,
      signal,
    );
  },
};
