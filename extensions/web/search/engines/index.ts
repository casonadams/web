import { bingEngine } from "./bing.ts";
import { ddgLiteEngine } from "./ddg-lite.ts";
import type { SearchEngine } from "./types.ts";
import { yahooEngine } from "./yahoo.ts";

/** All supported search engines. Add or remove an engine here. */
export const ENGINES: SearchEngine[] = [ddgLiteEngine, yahooEngine, bingEngine];

/** All engines in a random order. */
export function shuffledEngines(): SearchEngine[] {
  const copy = [...ENGINES];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
