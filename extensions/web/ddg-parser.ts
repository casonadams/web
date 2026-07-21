/** A single search result from DuckDuckGo Lite. */
export interface DdgResult {
  title: string;
  abstract: string;
  url: string;
  hostname?: string;
  source?: string;
  contentHint?: string;
}

interface ResultAccumulator {
  title: string;
  lines: string[];
}

function looksLikeUrl(value: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/:?#]|$)/i.test(
    value,
  );
}

function flushResult(result: ResultAccumulator): DdgResult | null {
  const lines = [...result.lines];
  while (lines.at(-1) === "") lines.pop();

  const separator = lines.lastIndexOf("");
  const separatedUrl =
    separator >= 0 ? lines.slice(separator + 1).join("") : undefined;
  const rawUrl =
    separatedUrl && looksLikeUrl(separatedUrl)
      ? separatedUrl
      : lines.at(-1) && looksLikeUrl(lines.at(-1) ?? "")
        ? (lines.pop() ?? "")
        : "";
  if (!rawUrl) return null;
  if (separator >= 0 && separatedUrl === rawUrl) lines.splice(separator);

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  return {
    title: result.title,
    abstract: lines.filter(Boolean).join(" ").trim(),
    url,
  };
}

function startResult(raw: string): ResultAccumulator | null {
  const match = raw.match(/^\s*\d+\.\s+(.+)$/);
  const title = match?.[1]?.trim();
  return title ? { title, lines: [] } : null;
}

/** Parse `lynx -dump -nolist` output from DuckDuckGo Lite. */
export function parseDdgLite(
  output: string,
  options: { minSnippetChars: number },
): DdgResult[] {
  const blocks: ResultAccumulator[] = [];
  let current: ResultAccumulator | null = null;
  for (const raw of output.split("\n")) {
    const next = startResult(raw);
    if (next) {
      current = next;
      blocks.push(current);
      continue;
    }
    if (current) current.lines.push(raw.trim());
  }

  return blocks
    .map(flushResult)
    .filter((result): result is DdgResult => result !== null)
    .filter((result) => result.abstract.length >= options.minSnippetChars);
}
