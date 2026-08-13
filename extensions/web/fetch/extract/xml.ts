import { DOMParser } from "linkedom";
import { resolveRelativeUrl } from "./content-url.ts";
import { htmlToText } from "./html-to-text.ts";

function feedSummary(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  return /<[^>]+>/.test(trimmed)
    ? htmlToText(`<html><body>${trimmed}</body></html>`, baseUrl)
    : trimmed.replace(/\s+/g, " ");
}

interface XmlDocument {
  querySelectorAll(selectors: string): Iterable<XmlElement>;
}

interface XmlElement {
  localName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelectorAll(selectors: string): Iterable<XmlElement>;
}

function elementName(element: XmlElement): string {
  return element.localName.split(":").at(-1)?.toLowerCase() ?? "";
}

function descendantsByName(element: XmlElement, names: string[]): XmlElement[] {
  const accepted = new Set(names);
  return [...element.querySelectorAll("*")].filter((descendant) =>
    accepted.has(elementName(descendant)),
  );
}

function firstDescendant(
  element: XmlElement,
  names: string[],
): XmlElement | undefined {
  return descendantsByName(element, names)[0];
}

function extractSitemap(
  document: XmlDocument,
  root: "urlset" | "sitemapindex",
): string | null {
  const selector = root === "urlset" ? "url > loc" : "sitemap > loc";
  const title = root === "urlset" ? "Sitemap" : "Sitemap Index";
  const urls = [
    ...new Set(
      [...document.querySelectorAll(selector)]
        .map((element) => element.textContent?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  return urls.length > 0
    ? `# ${title}\n\n${urls.map((url, index) => `${index + 1}. ${url}`).join("\n")}`
    : null;
}

function formatFeedEntry(
  entry: XmlElement,
  index: number,
  baseUrl: string,
): string {
  const title =
    firstDescendant(entry, ["title"])?.textContent?.trim() || "Untitled";
  const linkElements = descendantsByName(entry, ["link"]);
  const linkElement =
    linkElements.find((element) => {
      const rel = element.getAttribute("rel")?.trim().toLowerCase();
      return !rel || rel.split(/\s+/).includes("alternate");
    }) ?? linkElements[0];
  const rawLink =
    linkElement?.getAttribute("href") || linkElement?.textContent?.trim() || "";
  const link = resolveRelativeUrl(rawLink, baseUrl);
  const date = firstDescendant(entry, [
    "published",
    "updated",
    "pubdate",
    "date",
  ])?.textContent?.trim();
  const rawSummary = firstDescendant(entry, [
    "summary",
    "description",
    "content",
    "encoded",
  ])?.textContent?.trim();
  return [
    `## ${index + 1}. ${title}`,
    date ? `Date: ${date}` : undefined,
    link ? `URL: ${link}` : undefined,
    rawSummary ? feedSummary(rawSummary, baseUrl) : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function extractFeed(
  rootElement: XmlElement,
  root: string,
  baseUrl: string,
): string | null {
  if (root !== "rss" && root !== "feed" && root !== "rdf") return null;
  const entries = descendantsByName(rootElement, [
    root === "feed" ? "entry" : "item",
  ]);
  const channel = firstDescendant(rootElement, ["channel"]);
  if (root === "rdf" && !channel && entries.length === 0) return null;
  const title =
    firstDescendant(channel ?? rootElement, ["title"])?.textContent?.trim() ||
    "Feed";
  return [
    `# Feed: ${title}`,
    ...entries.map((entry, index) => formatFeedEntry(entry, index, baseUrl)),
  ].join("\n\n");
}

export function extractXml(body: string, baseUrl: string): string | null {
  const document = new DOMParser().parseFromString(body, "text/xml");
  const rootElement = document?.documentElement;
  if (!rootElement) return null;
  const root = elementName(rootElement);
  return root === "urlset" || root === "sitemapindex"
    ? extractSitemap(document, root)
    : extractFeed(rootElement, root, baseUrl);
}
