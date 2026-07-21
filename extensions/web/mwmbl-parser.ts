import type { DdgResult } from "./ddg-parser.ts";

interface MwmblFragment {
  value?: unknown;
}

interface MwmblResult {
  title?: unknown;
  url?: unknown;
  extract?: unknown;
}

function fragmentText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((fragment) =>
      fragment &&
      typeof fragment === "object" &&
      typeof (fragment as MwmblFragment).value === "string"
        ? (fragment as MwmblFragment).value
        : "",
    )
    .join("")
    .trim();
}

export function parseMwmblResults(value: unknown): DdgResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DdgResult[] => {
    if (!item || typeof item !== "object") return [];
    const result = item as MwmblResult;
    if (typeof result.url !== "string" || !/^https?:\/\//i.test(result.url)) {
      return [];
    }
    const title = fragmentText(result.title);
    if (!title) return [];
    return [{ title, abstract: fragmentText(result.extract), url: result.url }];
  });
}
