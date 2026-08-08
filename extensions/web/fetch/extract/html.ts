import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { FetchMode } from "../fetch-types.ts";
import { htmlToText } from "./html-to-text.ts";

interface MainContent {
  text: string;
  title?: string;
  byline?: string;
  siteName?: string;
  method: string;
}

function effectiveBaseUrl(
  document: ReturnType<typeof parseHTML>["document"],
  responseUrl: string,
): string {
  const href = document.querySelector("base[href]")?.getAttribute("href");
  if (!href) return responseUrl;
  try {
    return new URL(href, responseUrl).href;
  } catch {
    return responseUrl;
  }
}

function candidateText(
  html: string,
  baseUrl: string,
  fullTextLength: number,
): string | undefined {
  const text = htmlToText(`<html><body>${html}</body></html>`, baseUrl);
  const threshold = Math.min(400, Math.max(120, fullTextLength * 0.15));
  return text.length >= threshold ? text : undefined;
}

function extractMainContent(
  document: ReturnType<typeof parseHTML>["document"],
  baseUrl: string,
  fullTextLength: number,
): MainContent | null {
  let semantic: Element | undefined;
  let semanticLength = -1;
  for (const candidate of document.querySelectorAll("main, article")) {
    const length = candidate.textContent?.trim().length ?? 0;
    if (length > semanticLength) {
      semantic = candidate;
      semanticLength = length;
    }
  }
  if (semantic?.outerHTML) {
    const text = candidateText(semantic.outerHTML, baseUrl, fullTextLength);
    if (text !== undefined) {
      return {
        text,
        title: document.title || undefined,
        method: `<${semantic.localName}>`,
      };
    }
  }

  const article = new Readability(document).parse();
  if (article?.content) {
    const text = candidateText(article.content, baseUrl, fullTextLength);
    if (text !== undefined) {
      return {
        text,
        title: article.title || undefined,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        method: "Readability",
      };
    }
  }
  return null;
}

function formatMainContent(content: MainContent): string {
  const metadata = [
    content.title ? `# ${content.title}` : undefined,
    content.byline ? `By: ${content.byline}` : undefined,
    content.siteName ? `Site: ${content.siteName}` : undefined,
  ].filter((value): value is string => Boolean(value));
  return [
    `[HTML extraction: main content via ${content.method}. Use mode="full" if important navigation or sidebars are missing.]`,
    ...metadata,
    content.text,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function extractHtml(
  html: string,
  responseUrl: string,
  mode: FetchMode,
): { text: string; extraction: "main" | "full" } {
  const { document } = parseHTML(html);
  const baseUrl = effectiveBaseUrl(document, responseUrl);
  const fullText = htmlToText(html, baseUrl);
  if (mode !== "full") {
    const main = extractMainContent(document, baseUrl, fullText.length);
    if (main) return { text: formatMainContent(main), extraction: "main" };
    if (mode === "main") {
      throw new Error(
        'could not identify substantial main content; retry with mode="full"',
      );
    }
  }

  if (fullText.length < 100) {
    let scriptSize = 0;
    for (const match of html.matchAll(
      /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      scriptSize += match[1]?.length ?? 0;
      if (scriptSize > 500) break;
    }
    if (scriptSize > 500 || /id=["'](?:app|root|__next)["']/i.test(html)) {
      throw new Error(
        "page contains little static content and may require a JavaScript-capable browser",
      );
    }
  }
  return {
    text: `[HTML extraction: full page.]\n\n${fullText}`,
    extraction: "full",
  };
}
