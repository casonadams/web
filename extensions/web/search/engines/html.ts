import { config } from "../../config.ts";
import { fetchText } from "../../http/http.ts";
import { relaxedSearchQueries } from "../query-utils.ts";
import type { SearchResult } from "../result.ts";

const LYNX_UA = "Lynx/2.9.3 libwww-FM/2.14 SSL-MM/1.4.1 OpenSSL/4.0.0";

/** Fetch an HTML search engine, retrying relaxed query variants on empty results. */
export async function searchHtml(
  url: (query: string) => string,
  parse: (html: string) => SearchResult[],
  query: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const queries = [query, ...relaxedSearchQueries(query)];
  for (const candidate of queries) {
    const response = await fetchText(url(candidate), {
      timeoutSec: config.searchTimeout,
      maxBytes: config.searchMaxBytes,
      allowPrivateNetwork: config.allowPrivateNetwork,
      retries: config.httpRetries,
      signal,
      headers: { "user-agent": LYNX_UA },
    });
    const results = parse(response.body);
    if (results.length > 0) return results;
  }
  return [];
}
