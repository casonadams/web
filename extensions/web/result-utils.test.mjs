import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMwmblResults } from "./mwmbl-parser.ts";
import { mergeResults, normalizeResults } from "./result-utils.ts";

test("parseMwmblResults: joins highlighted title and extract fragments", () => {
  assert.deepEqual(
    parseMwmblResults([
      {
        url: "https://example.com/result",
        title: [
          { value: "Example", is_bold: true },
          { value: " result", is_bold: false },
        ],
        extract: [
          { value: "Useful ", is_bold: false },
          { value: "summary", is_bold: true },
        ],
      },
    ]),
    [
      {
        title: "Example result",
        abstract: "Useful summary",
        url: "https://example.com/result",
      },
    ],
  );
});
test("normalizeResults: canonicalizes URLs and adds selection signals", () => {
  const [result] = normalizeResults(
    [
      {
        title: "API reference",
        abstract: "Reference documentation",
        url: "https://docs.example.com/api/?utm_source=test&b=2&a=1#section",
      },
    ],
    "DuckDuckGo via lynx",
  );
  assert.equal(result.url, "https://docs.example.com/api/?a=1&b=2");
  assert.equal(result.hostname, "docs.example.com");
  assert.equal(result.contentHint, "documentation");
  assert.equal(result.source, "DuckDuckGo via lynx");
});
test("mergeResults: deduplicates URLs and prefers HTTPS", () => {
  const current = normalizeResults(
    [{ title: "HTTP", abstract: "first", url: "http://example.com/docs/" }],
    "first",
  );
  const incoming = normalizeResults(
    [{ title: "HTTPS", abstract: "second", url: "https://example.com/docs" }],
    "second",
  );
  const results = mergeResults(current, incoming, "example", 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "HTTPS");
  assert.equal(results[0].url, "https://example.com/docs");
});
test("normalizeResults: converts GitHub blob URLs to direct content", () => {
  const [result] = normalizeResults(
    [
      {
        title: "README",
        abstract: "Repository documentation",
        url: "https://github.com/unjs/unpdf/blob/main/README.md?plain=1",
      },
    ],
    "DuckDuckGo via lynx",
  );
  assert.equal(
    result.url,
    "https://raw.githubusercontent.com/unjs/unpdf/main/README.md",
  );
  assert.equal(result.contentHint, "GitHub");
  const ranked = mergeResults(
    [],
    [{ title: "Other", abstract: "", url: "https://example.com/file" }, result],
    "PDF site:github.com",
    10,
  );
  assert.equal(ranked[0].url, result.url);
});
test("mergeResults: prioritizes exact site-filter matches", () => {
  const results = normalizeResults(
    [
      { title: "Other", abstract: "", url: "https://other.test/page" },
      { title: "Docs", abstract: "", url: "https://docs.example.com/page" },
    ],
    "test",
  );
  assert.deepEqual(
    mergeResults([], results, "topic site:example.com/docs", 10).map(
      (result) => result.title,
    ),
    ["Docs", "Other"],
  );
});
