import { parseHTML } from "linkedom";
import type { SearchResult } from "../result.ts";
import { searchHtml } from "./html.ts";
import type { SearchEngine } from "./types.ts";
import { strip } from "./utils.ts";

export const BRAVE_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BRAVE_HEADERS = {
  "user-agent": BRAVE_CHROME_UA,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "upgrade-insecure-requests": "1",
};

export function parseBraveHtml(html: string): SearchResult[] {
  const { document } = parseHTML(html);
  const results: SearchResult[] = [];
  for (const block of document.querySelectorAll(
    'div.snippet[data-type="web"]',
  )) {
    const anchor = block.querySelector("a[href]");
    const url = anchor?.getAttribute("href");
    const title = block.querySelector("div.title")?.textContent;
    if (!url || !title) continue;
    const content = block.querySelector("div.content")?.textContent;
    results.push({
      title: strip(title),
      abstract: content ? strip(content) : "",
      url,
    });
  }
  return results;
}

const BRAVE_TF_MAP: Record<string, string> = {
  day: "pd",
  week: "pw",
  month: "pm",
  year: "py",
};

export const braveEngine: SearchEngine = {
  name: "Brave",
  search: (query, signal, options) => {
    const tfParam =
      options?.recency && BRAVE_TF_MAP[options.recency]
        ? `&tf=${BRAVE_TF_MAP[options.recency]}`
        : "";
    return searchHtml(
      (q) =>
        `https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web${tfParam}`,
      parseBraveHtml,
      query,
      signal,
      BRAVE_HEADERS,
    );
  },
};
