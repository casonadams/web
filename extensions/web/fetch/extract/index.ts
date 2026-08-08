import type { ExtractedText, FetchMode } from "../fetch-types.ts";
import { extractCsv } from "./csv.ts";
import { extractHtml } from "./html.ts";
import { resolveMarkdownLinks } from "./markdown.ts";
import { extractXml } from "./xml.ts";

function charsetFromBom(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return undefined;
}

function charsetFromHtml(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, 4096));
  return (
    head.match(/<meta\s+[^>]*charset=["']?\s*([^\s"'/>]+)/i)?.[1] ??
    head.match(/<meta\s+[^>]*content=["'][^"']*charset=([^\s"';/>]+)/i)?.[1]
  );
}

export function decodeBody(bytes: Uint8Array, contentType: string): string {
  const charset =
    charsetFromBom(bytes) ??
    contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ??
    charsetFromHtml(bytes) ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function isMarkdown(contentType: string, url: string): boolean {
  return (
    contentType.includes("markdown") ||
    /\.(?:md|markdown)(?:$|[?#])/i.test(new URL(url).pathname)
  );
}

function isCsv(contentType: string, url: string): boolean {
  return (
    contentType.includes("csv") ||
    contentType.includes("tab-separated") ||
    /\.(?:csv|tsv)(?:$|[?#])/i.test(new URL(url).pathname)
  );
}

function csvDelimiter(contentType: string, url: string): string {
  return contentType.includes("tab-separated") ||
    /\.tsv(?:$|[?#])/i.test(new URL(url).pathname)
    ? "\t"
    : ",";
}

export function responseToText(
  body: string,
  contentType: string,
  baseUrl: string,
  mode: FetchMode,
): ExtractedText {
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
    contentType.includes("html") ||
    contentType.includes("xhtml") ||
    /^\s*<!doctype html/i.test(body) ||
    /^\s*<html[\s>]/i.test(body)
  ) {
    return extractHtml(body, baseUrl, mode);
  }
  if (
    contentType.includes("xml") ||
    /^\s*<\?xml\b/i.test(body) ||
    /^\s*<(?:rss|feed|urlset|sitemapindex)\b/i.test(body)
  ) {
    const xml = extractXml(body, baseUrl);
    return { text: xml ?? body.trim(), extraction: "xml" };
  }
  if (isCsv(contentType, baseUrl)) {
    return {
      text: extractCsv(body, csvDelimiter(contentType, baseUrl)),
      extraction: "csv",
    };
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
