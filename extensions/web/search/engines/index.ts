import { braveEngine } from "./brave.ts";
import { ddgLiteEngine } from "./ddg-lite.ts";
import { firecrawlEngine } from "./firecrawl.ts";
import type { SearchEngine } from "./types.ts";
import { yahooEngine } from "./yahoo.ts";

const ENGINES: SearchEngine[] = [
  braveEngine,
  ddgLiteEngine,
  firecrawlEngine,
  yahooEngine,
];

export function shuffledEngines(): SearchEngine[] {
  const copy = [...ENGINES];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
