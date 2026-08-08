import { parseHTML } from "linkedom";
import type { SearchResult } from "../result.ts";
import { searchHtml } from "./html.ts";
import type { SearchEngine } from "./types.ts";
import { strip } from "./utils.ts";

function decodeBingUrl(href: string): string {
  const u = new URL(href).searchParams.get("u");
  if (!u) return href;
  const decoded = Buffer.from(u.replace(/^a1/, ""), "base64").toString("utf8");
  return decoded || href;
}

/** Parse Bing Search HTML (`li.b_algo` + `h2 a` + `.b_caption p`). */
export function parseBingHtml(html: string): SearchResult[] {
  const { document } = parseHTML(html);
  const results: SearchResult[] = [];
  for (const block of document.querySelectorAll("li.b_algo")) {
    const anchor = block.querySelector("h2 a");
    const href = anchor?.getAttribute("href");
    if (!href) continue;
    const snippet = block.querySelector(".b_caption p");
    results.push({
      title: anchor?.textContent?.trim() ?? "",
      abstract: snippet?.textContent ? strip(snippet.textContent) : "",
      url: decodeBingUrl(href),
    });
  }
  return results;
}

export const bingEngine: SearchEngine = {
  name: "Bing",
  search: (query, signal) =>
    searchHtml(
      (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      parseBingHtml,
      query,
      signal,
    ),
};
