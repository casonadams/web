import { resolveRelativeUrl } from "./content-url.ts";

export function resolveMarkdownLinks(
  markdown: string,
  baseUrl: string,
): string {
  let fence: { marker: string; length: number } | undefined;
  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fenceMatch?.[1]) {
        const marker = fenceMatch[1][0] ?? "";
        if (!fence) {
          fence = { marker, length: fenceMatch[1].length };
        } else if (
          marker === fence.marker &&
          fenceMatch[1].length >= fence.length &&
          !fenceMatch[2]?.trim()
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
