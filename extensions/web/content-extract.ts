import type { ExtractedText, FetchMode } from "./fetch-types.ts";
import { extractHtml } from "./html-extract.ts";
import { resolveMarkdownLinks } from "./markdown-extract.ts";
import { extractXml } from "./xml-extract.ts";

function charsetFromHtml(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, 4096));
  return (
    head.match(/<meta\s+[^>]*charset=["']?\s*([^\s"'/>]+)/i)?.[1] ??
    head.match(/<meta\s+[^>]*content=["'][^"']*charset=([^\s"';/>]+)/i)?.[1]
  );
}

export function decodeBody(bytes: Uint8Array, contentType: string): string {
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

function isMarkdown(contentType: string, url: string): boolean {
  return (
    contentType.includes("markdown") ||
    /\.(?:md|markdown)(?:$|[?#])/i.test(new URL(url).pathname)
  );
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
    /^\s*<(?:rss|feed|urlset)\b/i.test(body)
  ) {
    const xml = extractXml(body, baseUrl);
    return { text: xml ?? body.trim(), extraction: "xml" };
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
