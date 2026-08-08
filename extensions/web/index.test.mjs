import assert from "node:assert/strict";
import { test } from "vitest";
import registerWebTools from "./index.ts";
import { renderFetchResult, renderSearchResult } from "./logic.ts";
import {
  formatSearchResults,
  MAX_SEARCH_OUTPUT_BYTES,
} from "./search/format.ts";

function registeredTool(name) {
  const tools = [];
  registerWebTools({
    registerTool(tool) {
      tools.push(tool);
    },
  });
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool);
  return tool;
}

test("tools rely on their schemas instead of duplicating guidance in the system prompt", () => {
  for (const name of ["websearch", "webfetch"]) {
    const tool = registeredTool(name);
    assert.equal(tool.promptSnippet, undefined);
    assert.equal(tool.promptGuidelines, undefined);
  }

  assert.match(
    registeredTool("webfetch").description,
    /HTML, XHTML, Markdown, RSS\/Atom\/RDF feeds, XML sitemaps, JSON, CSV\/TSV, text, or PDF/,
  );
});

test("webfetch: throws for invalid URLs so pi marks the result as an error", async () => {
  const tool = registeredTool("webfetch");
  await assert.rejects(
    tool.execute("call", { url: "file:///etc/passwd" }, undefined),
    /Fetch blocked: only http and https URLs are allowed/,
  );
});

test("webfetch: propagates caller cancellation", async () => {
  const tool = registeredTool("webfetch");
  const reason = new Error("fetch cancelled by caller");
  const controller = new AbortController();
  controller.abort(reason);
  await assert.rejects(
    tool.execute("call", { url: "https://example.com" }, controller.signal),
    (error) => error === reason,
  );
});

test("renderFetchResult: renders errored calls as failures", () => {
  const theme = {
    bold: (text) => text,
    fg: (color, text) => `[${color}]${text}`,
  };
  const component = renderFetchResult(
    { details: { sourceUrl: "https://example.com" } },
    { isPartial: false },
    theme,
    { isError: true },
  );
  const output = component.render(200).join("\n");
  assert.match(output, /\[error\]/);
  assert.doesNotMatch(output, /\[success\]/);
});

test("formatSearchResults: bounds prose while preserving every URL", () => {
  const results = Array.from({ length: 10 }, (_, index) => ({
    title: `title-${index}-${"x".repeat(1_000)}`,
    abstract: `abstract-${index}-${"y".repeat(5_000)}`,
    url: `https://example.com/result/${index}`,
  }));
  const output = formatSearchResults("q".repeat(2_000), results);
  assert.ok(Buffer.byteLength(output) <= MAX_SEARCH_OUTPUT_BYTES);
  assert.doesNotMatch(output, /x{201}/);
  assert.doesNotMatch(output, /y{601}/);
  for (const result of results) assert.match(output, new RegExp(result.url));
  assert.match(
    output,
    /\[Truncated snippets for \d+ of 10 search results\.\]$/,
  );
});

test("formatSearchResults: never truncates oversized result URLs", () => {
  const url = `https://example.com/${"path".repeat(2_000)}`;
  const output = formatSearchResults("example", [
    { title: "Example", abstract: "Summary", url },
  ]);
  assert.ok(output.includes(url));
  assert.match(output, /Titles and snippets omitted to preserve complete URLs/);
});

test("renderSearchResult: surfaces the error instead of 0 results", () => {
  const theme = {
    bold: (text) => text,
    fg: (color, text) => `[${color}]${text}`,
  };
  const component = renderSearchResult(
    { content: [{ type: "text", text: "DuckDuckGo Lite: no results" }] },
    { isPartial: false },
    theme,
    { isError: true },
  );
  const output = component.render(200).join("\n");
  assert.match(output, /\[error\]search failed: DuckDuckGo Lite: no results/);
  assert.doesNotMatch(output, /0 results/);
});
