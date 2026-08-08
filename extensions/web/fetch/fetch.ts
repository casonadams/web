import { config } from "../config.ts";
import { fetchBytes } from "../http/http.ts";
import { decodeBody, responseToText } from "./extract/index.ts";
import { pdfToText } from "./extract/pdf.ts";
import { getOrLoadResource, resourceCacheKey } from "./fetch-cache.ts";
import type {
  ExtractedResource,
  ExtractedText,
  FetchedPage,
  FetchMode,
} from "./fetch-types.ts";
import { pageLines, preparedSize, prepareLines } from "./pagination.ts";

export type { ExtractionKind, FetchedPage, FetchMode } from "./fetch-types.ts";

function isPdf(bytes: Uint8Array, contentType: string): boolean {
  return (
    contentType.includes("application/pdf") ||
    new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-"
  );
}

async function loadResource(
  url: string,
  mode: FetchMode,
  signal: AbortSignal,
): Promise<ExtractedResource> {
  const response = await fetchBytes(url, {
    timeoutSec: config.fetchTimeout,
    maxBytes: config.fetchMaxBytes,
    pdfMaxBytes: config.pdfMaxBytes,
    allowPrivateNetwork: config.allowPrivateNetwork,
    retries: config.httpRetries,
    signal,
  });
  signal.throwIfAborted();
  const extracted: ExtractedText = isPdf(response.body, response.contentType)
    ? {
        text: await pdfToText(response.body, signal),
        extraction: "pdf",
      }
    : responseToText(
        decodeBody(response.body, response.contentType),
        response.contentType,
        response.url,
        mode,
      );
  signal.throwIfAborted();

  const output =
    response.url !== url
      ? `[Final URL after redirects: ${response.url}]\n\n${extracted.text}`
      : extracted.text;
  const lines = prepareLines(
    output,
    Math.min(4000, config.outputMaxBytes - 256),
  );
  return {
    lines,
    extraction: extracted.extraction,
    finalUrl: response.url,
    size: preparedSize(lines),
  };
}

async function fetchResource(
  url: string,
  mode: FetchMode,
  signal: AbortSignal | undefined,
): Promise<ExtractedResource> {
  const key = resourceCacheKey(url, mode);
  return getOrLoadResource(key, signal, (sharedSignal) =>
    loadResource(url, mode, sharedSignal),
  );
}

export async function fetchPage(
  url: string,
  offset: number,
  limit: number,
  mode: FetchMode = "auto",
  signal?: AbortSignal,
): Promise<FetchedPage> {
  const resource = await fetchResource(url, mode, signal);
  const pageByteLimit = config.outputMaxBytes - 256;
  const total = resource.lines.length;
  const start = Math.max(0, Math.floor(offset) - 1);
  const pageLimit = Math.max(1, Math.floor(limit));
  const page = pageLines(resource.lines, start, pageLimit, pageByteLimit);
  const nextOffset = start + page.consumed + 1;
  const truncated = start + page.consumed < total;
  const content = truncated
    ? `${page.content}\n\n[Truncated: ${total} lines total. Use offset=${nextOffset} to continue.]`
    : page.content;
  return {
    content,
    total,
    nextOffset: truncated ? nextOffset : -1,
    extraction: resource.extraction,
    finalUrl: resource.finalUrl,
  };
}
