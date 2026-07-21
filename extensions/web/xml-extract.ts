import { DOMParser } from "linkedom";
import { resolveRelativeUrl } from "./content-url.ts";
import { htmlToText } from "./html-to-text.ts";

function feedSummary(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  return /<[^>]+>/.test(trimmed)
    ? htmlToText(`<html><body>${trimmed}</body></html>`, baseUrl)
    : trimmed.replace(/\s+/g, " ");
}

export function extractXml(body: string, baseUrl: string): string | null {
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
    const linkElements = [...entry.querySelectorAll("link")];
    const linkElement =
      linkElements.find((element) => {
        const rel = element.getAttribute("rel")?.trim().toLowerCase();
        return !rel || rel.split(/\s+/).includes("alternate");
      }) ?? linkElements[0];
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
