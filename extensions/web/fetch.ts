import { Worker } from "node:worker_threads";
import { Readability } from "@mozilla/readability";
import { convert } from "html-to-text";
import { DOMParser, parseHTML } from "linkedom";
import { config } from "./config.ts";
import { fetchBytes } from "./http.ts";

export type FetchMode = "auto" | "main" | "full";
export type ExtractionKind =
  | "main"
  | "full"
  | "pdf"
  | "json"
  | "markdown"
  | "xml"
  | "text";

export interface FetchedPage {
  content: string;
  total: number;
  nextOffset: number;
  extraction: ExtractionKind;
  finalUrl: string;
}

interface MainContent {
  html: string;
  title?: string;
  byline?: string;
  siteName?: string;
  method: string;
}

interface ExtractedResource {
  text: string;
  extraction: ExtractionKind;
  finalUrl: string;
}

interface CacheEntry {
  resource: ExtractedResource;
  expiresAt: number;
  size: number;
}

interface InFlightResource {
  promise: Promise<ExtractedResource>;
  controller: AbortController;
  waiters: number;
}

const extractionCache = new Map<string, CacheEntry>();
const inFlightResources = new Map<string, InFlightResource>();
let extractionCacheBytes = 0;

function cacheKey(url: string, mode: FetchMode): string {
  return `${config.allowPrivateNetwork ? "private" : "public"}:${mode}:${url}`;
}

function getCachedResource(key: string): ExtractedResource | undefined {
  const entry = extractionCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    extractionCache.delete(key);
    extractionCacheBytes -= entry.size;
    return undefined;
  }
  extractionCache.delete(key);
  extractionCache.set(key, entry);
  return entry.resource;
}

function cacheResource(key: string, resource: ExtractedResource): void {
  if (config.fetchCacheTtlSec <= 0) return;
  const size = new TextEncoder().encode(resource.text).byteLength;
  if (size > config.fetchCacheMaxBytes) return;
  const previous = extractionCache.get(key);
  if (previous) {
    extractionCache.delete(key);
    extractionCacheBytes -= previous.size;
  }
  while (
    extractionCache.size >= config.fetchCacheEntries ||
    extractionCacheBytes + size > config.fetchCacheMaxBytes
  ) {
    const oldestKey = extractionCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    const oldest = extractionCache.get(oldestKey);
    extractionCache.delete(oldestKey);
    extractionCacheBytes -= oldest?.size ?? 0;
  }
  extractionCache.set(key, {
    resource,
    expiresAt: Date.now() + config.fetchCacheTtlSec * 1000,
    size,
  });
  extractionCacheBytes += size;
}

function htmlToText(html: string, baseUrl: string): string {
  return convert(html, {
    baseElements: { selectors: ["body"] },
    decodeEntities: true,
    preserveNewlines: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
      { selector: "svg", format: "skip" },
      { selector: "img", format: "skip" },
      {
        selector: "a",
        options: {
          hideLinkHrefIfSameAsText: true,
          pathRewrite: (href: string) => {
            try {
              return new URL(href, baseUrl).href;
            } catch {
              return href;
            }
          },
        },
      },
    ],
    wordwrap: 120,
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function effectiveBaseUrl(html: string, responseUrl: string): string {
  const { document } = parseHTML(html);
  const href = document.querySelector("base[href]")?.getAttribute("href");
  if (!href) return responseUrl;
  try {
    return new URL(href, responseUrl).href;
  } catch {
    return responseUrl;
  }
}

function candidateThreshold(fullTextLength: number): number {
  return Math.min(400, Math.max(120, fullTextLength * 0.15));
}

function substantialMainContent(
  html: string,
  baseUrl: string,
  fullTextLength: number,
): boolean {
  return (
    htmlToText(`<html><body>${html}</body></html>`, baseUrl).length >=
    candidateThreshold(fullTextLength)
  );
}

function extractMainContent(
  html: string,
  baseUrl: string,
  fullTextLength: number,
): MainContent | null {
  const { document } = parseHTML(html);
  const semantic = [...document.querySelectorAll("main, article")].sort(
    (left, right) =>
      (right.textContent?.trim().length ?? 0) -
      (left.textContent?.trim().length ?? 0),
  )[0];
  if (
    semantic?.outerHTML &&
    substantialMainContent(semantic.outerHTML, baseUrl, fullTextLength)
  ) {
    return {
      html: semantic.outerHTML,
      title: document.title || undefined,
      method: `<${semantic.localName}>`,
    };
  }

  const article = new Readability(document).parse();
  if (
    article?.content &&
    substantialMainContent(article.content, baseUrl, fullTextLength)
  ) {
    return {
      html: article.content,
      title: article.title || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      method: "Readability",
    };
  }
  return null;
}

function formatMainContent(content: MainContent, baseUrl: string): string {
  const metadata = [
    content.title ? `# ${content.title}` : undefined,
    content.byline ? `By: ${content.byline}` : undefined,
    content.siteName ? `Site: ${content.siteName}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const text = htmlToText(`<html><body>${content.html}</body></html>`, baseUrl);
  return [
    `[HTML extraction: main content via ${content.method}. Use mode="full" if important navigation or sidebars are missing.]`,
    ...metadata,
    text,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractHtml(
  html: string,
  responseUrl: string,
  mode: FetchMode,
): { text: string; extraction: "main" | "full" } {
  const baseUrl = effectiveBaseUrl(html, responseUrl);
  const fullText = htmlToText(html, baseUrl);
  if (mode !== "full") {
    const main = extractMainContent(html, baseUrl, fullText.length);
    if (main) {
      return { text: formatMainContent(main, baseUrl), extraction: "main" };
    }
    if (mode === "main") {
      throw new Error(
        'could not identify substantial main content; retry with mode="full"',
      );
    }
  }

  const scriptSize = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
  ].reduce((size, match) => size + (match[1]?.length ?? 0), 0);
  if (
    fullText.length < 100 &&
    (scriptSize > 500 || /id=["'](?:app|root|__next)["']/i.test(html))
  ) {
    throw new Error(
      "page contains little static content and may require a JavaScript-capable browser",
    );
  }
  return {
    text: `[HTML extraction: full page.]\n\n${fullText}`,
    extraction: "full",
  };
}

function isPdf(bytes: Uint8Array, contentType: string): boolean {
  return (
    contentType.includes("application/pdf") ||
    new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-"
  );
}

interface PdfWorkerResult {
  text?: string;
  error?: string;
}

function pdfToText(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdf-worker.ts", import.meta.url), {
      workerData: bytes,
      transferList: [bytes.buffer as ArrayBuffer],
    });
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            `PDF extraction timed out after ${config.extractionTimeout}s`,
          ),
        ),
      config.extractionTimeout * 1000,
    );
    const onAbort = () => finish(signal.reason);
    const finish = (error?: unknown, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      worker.removeAllListeners();
      void worker.terminate();
      if (error !== undefined) reject(error);
      else resolve(text ?? "");
    };

    signal.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (result: PdfWorkerResult) => {
      if (result.error) finish(new Error(result.error));
      else finish(undefined, result.text);
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      finish(
        new Error(
          `PDF worker exited with code ${code} before returning a result`,
        ),
      );
    });
  });
}

function charsetFromHtml(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, 4096));
  return (
    head.match(/<meta\s+[^>]*charset=["']?\s*([^\s"'/>]+)/i)?.[1] ??
    head.match(/<meta\s+[^>]*content=["'][^"']*charset=([^\s"';/>]+)/i)?.[1]
  );
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const charset =
    contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ??
    charsetFromHtml(bytes) ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function resolveRelativeUrl(target: string, baseUrl: string): string {
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return target;
  }
  try {
    return new URL(target, baseUrl).href;
  } catch {
    return target;
  }
}

function resolveMarkdownLinks(markdown: string, baseUrl: string): string {
  let fence: { marker: string; length: number } | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMatch?.[1]) {
        const marker = fenceMatch[1][0] ?? "";
        if (!fence) {
          fence = { marker, length: fenceMatch[1].length };
        } else if (
          marker === fence.marker &&
          fenceMatch[1].length >= fence.length
        ) {
          fence = undefined;
        }
        return line;
      }
      if (fence) return line;
      const references = line.replace(
        /^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/,
        (_match, prefix: string, target: string, suffix: string) =>
          `${prefix}${resolveRelativeUrl(target, baseUrl)}${suffix}`,
      );
      return references.replace(
        /(!?\[[^\]]*\]\()(<[^>]+>|(?:[^()\s]|\([^()]*\))+)([^)]*\))/g,
        (_match, prefix: string, rawTarget: string, suffix: string) => {
          const angled = rawTarget.startsWith("<") && rawTarget.endsWith(">");
          const target = angled ? rawTarget.slice(1, -1) : rawTarget;
          const resolved = resolveRelativeUrl(target, baseUrl);
          return `${prefix}${angled ? `<${resolved}>` : resolved}${suffix}`;
        },
      );
    })
    .join("\n");
}

function isMarkdown(contentType: string, url: string): boolean {
  return (
    contentType.includes("markdown") ||
    /\.(?:md|markdown)(?:$|[?#])/i.test(new URL(url).pathname)
  );
}

function feedSummary(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  return /<[^>]+>/.test(trimmed)
    ? htmlToText(`<html><body>${trimmed}</body></html>`, baseUrl)
    : trimmed.replace(/\s+/g, " ");
}

function extractXml(body: string, baseUrl: string): string | null {
  const document = new DOMParser().parseFromString(body, "text/xml");
  if (!document) return null;
  const root = document.documentElement?.localName?.toLowerCase();
  if (root === "urlset") {
    const urls = [...document.querySelectorAll("url > loc")]
      .map((element) => element.textContent?.trim())
      .filter((value): value is string => Boolean(value));
    return urls.length > 0
      ? `# Sitemap\n\n${urls.map((url, index) => `${index + 1}. ${url}`).join("\n")}`
      : null;
  }
  if (root !== "rss" && root !== "feed" && root !== "rdf") return null;

  const feedTitle =
    document
      .querySelector("channel > title, feed > title")
      ?.textContent?.trim() || "Feed";
  const entries = [
    ...document.querySelectorAll(root === "feed" ? "entry" : "item"),
  ];
  const formatted = entries.map((entry, index) => {
    const title =
      entry.querySelector("title")?.textContent?.trim() || "Untitled";
    const linkElement = entry.querySelector("link");
    const rawLink =
      linkElement?.getAttribute("href") ||
      linkElement?.textContent?.trim() ||
      "";
    const link = resolveRelativeUrl(rawLink, baseUrl);
    const date = entry
      .querySelector("published, updated, pubDate, date")
      ?.textContent?.trim();
    const rawSummary = entry
      .querySelector("summary, description, content, encoded")
      ?.textContent?.trim();
    return [
      `## ${index + 1}. ${title}`,
      date ? `Date: ${date}` : undefined,
      link ? `URL: ${link}` : undefined,
      rawSummary ? feedSummary(rawSummary, baseUrl) : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n");
  });
  return [`# Feed: ${feedTitle}`, ...formatted].join("\n\n");
}

function responseToText(
  body: string,
  contentType: string,
  baseUrl: string,
  mode: FetchMode,
): { text: string; extraction: ExtractionKind } {
  if (isMarkdown(contentType, baseUrl)) {
    return {
      text: resolveMarkdownLinks(body.trim(), baseUrl),
      extraction: "markdown",
    };
  }
  if (contentType.includes("json")) {
    try {
      return {
        text: JSON.stringify(JSON.parse(body), null, 2),
        extraction: "json",
      };
    } catch {
      return { text: body.trim(), extraction: "text" };
    }
  }
  if (
    contentType.includes("xml") ||
    /^\s*<\?xml\b/i.test(body) ||
    /^\s*<(?:rss|feed|urlset)\b/i.test(body)
  ) {
    const xml = extractXml(body, baseUrl);
    return { text: xml ?? body.trim(), extraction: "xml" };
  }
  if (
    contentType.includes("html") ||
    contentType.includes("xhtml") ||
    /^\s*<!doctype html/i.test(body) ||
    /^\s*<html[\s>]/i.test(body)
  ) {
    return extractHtml(body, baseUrl, mode);
  }
  if (
    contentType &&
    !contentType.startsWith("text/") &&
    !contentType.includes("xml")
  ) {
    throw new Error(`unsupported content type: ${contentType.split(";")[0]}`);
  }
  return { text: body.trim(), extraction: "text" };
}

function wrapLongLines(text: string, maxBytes = 4000): string[] {
  const encoder = new TextEncoder();
  const output: string[] = [];
  for (const line of text.split("\n")) {
    if (encoder.encode(line).byteLength <= maxBytes) {
      output.push(line);
      continue;
    }
    let current = "";
    let currentBytes = 0;
    for (const character of line) {
      const characterBytes = encoder.encode(character).byteLength;
      if (current && currentBytes + characterBytes > maxBytes) {
        output.push(current);
        current = "";
        currentBytes = 0;
      }
      current += character;
      currentBytes += characterBytes;
    }
    output.push(current);
  }
  return output;
}

function pageLines(
  lines: string[],
  start: number,
  lineLimit: number,
  byteLimit: number,
): { content: string; consumed: number } {
  const encoder = new TextEncoder();
  const selected: string[] = [];
  let bytes = 0;
  for (const line of lines.slice(start, start + lineLimit)) {
    const lineBytes =
      encoder.encode(line).byteLength + (selected.length ? 1 : 0);
    if (selected.length > 0 && bytes + lineBytes > byteLimit) break;
    selected.push(line);
    bytes += lineBytes;
  }
  return { content: selected.join("\n"), consumed: selected.length };
}

async function loadResource(
  key: string,
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
  const pdf = isPdf(response.body, response.contentType);
  const extracted = pdf
    ? {
        text: await pdfToText(response.body, signal),
        extraction: "pdf" as const,
      }
    : responseToText(
        decodeBody(response.body, response.contentType),
        response.contentType,
        response.url,
        mode,
      );
  signal.throwIfAborted();
  const resource = { ...extracted, finalUrl: response.url };
  cacheResource(key, resource);
  return resource;
}

function waitForResource(
  promise: Promise<ExtractedResource>,
  signal: AbortSignal | undefined,
): Promise<ExtractedResource> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

async function fetchResource(
  url: string,
  mode: FetchMode,
  signal: AbortSignal | undefined,
): Promise<ExtractedResource> {
  signal?.throwIfAborted();
  const key = cacheKey(url, mode);
  const cached = getCachedResource(key);
  if (cached) return cached;

  let inFlight = inFlightResources.get(key);
  if (!inFlight) {
    const controller = new AbortController();
    const promise = loadResource(key, url, mode, controller.signal);
    inFlight = { promise, controller, waiters: 0 };
    const created = inFlight;
    inFlightResources.set(key, created);
    const clear = () => {
      if (inFlightResources.get(key) === created) {
        inFlightResources.delete(key);
      }
    };
    promise.then(clear, clear);
  }

  inFlight.waiters += 1;
  try {
    return await waitForResource(inFlight.promise, signal);
  } finally {
    inFlight.waiters -= 1;
    if (inFlight.waiters === 0) {
      if (inFlightResources.get(key) === inFlight) {
        inFlightResources.delete(key);
      }
      inFlight.controller.abort();
    }
  }
}

export async function fetchPage(
  url: string,
  offset: number,
  limit: number,
  mode: FetchMode = "auto",
  signal?: AbortSignal,
): Promise<FetchedPage> {
  const resource = await fetchResource(url, mode, signal);
  const redirected = resource.finalUrl !== url;
  const output = redirected
    ? `[Final URL after redirects: ${resource.finalUrl}]\n\n${resource.text}`
    : resource.text;
  const pageByteLimit = config.outputMaxBytes - 256;
  const lines = wrapLongLines(output, Math.min(4000, pageByteLimit));
  const total = lines.length;
  const start = Math.max(0, Math.floor(offset) - 1);
  const pageLimit = Math.max(1, Math.floor(limit));
  const page = pageLines(lines, start, pageLimit, pageByteLimit);
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
