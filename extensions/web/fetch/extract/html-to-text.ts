import { convert } from "html-to-text";

export function htmlToText(html: string, baseUrl: string): string {
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
