import assert from "node:assert/strict";
import { test } from "vitest";
import {
  matchesDomainFilters,
  mergeResults,
  normalizeDomain,
  normalizeDomainFilters,
  normalizeResults,
} from "./result-utils.ts";

test("normalizeResults: canonicalizes URLs and adds selection signals", () => {
  const [result] = normalizeResults(
    [
      {
        title: "API reference",
        abstract: "Reference documentation",
        url: "https://docs.example.com/api/?utm_source=test&b=2&a=1#section",
      },
    ],
    "DuckDuckGo Lite",
  );
  assert.equal(result.url, "https://docs.example.com/api/?a=1&b=2");
  assert.equal(result.hostname, "docs.example.com");
  assert.equal(result.contentHint, "documentation");
  assert.equal(result.source, "DuckDuckGo Lite");
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
    "DuckDuckGo Lite",
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
  assert.deepEqual(
    ranked.map((entry) => entry.url),
    [result.url],
  );
});
test("mergeResults: excludes results outside site filters", () => {
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
    ["Docs"],
  );
});

test("normalizeDomain: cleans protocols, subpaths, www, and wildcards", () => {
  assert.equal(normalizeDomain("https://www.github.com/path"), "github.com");
  assert.equal(normalizeDomain("http://docs.rs:443"), "docs.rs");
  assert.equal(normalizeDomain("-www.bad-site.org/"), "bad-site.org");
  assert.equal(normalizeDomain("invalid domain!"), null);
  assert.equal(normalizeDomain(""), null);
});

test("normalizeDomainFilters: partitions allowed and blocked domains", () => {
  const filters = normalizeDomainFilters([
    "github.com",
    "-spam.com",
    "https://docs.rs",
    "-https://www.bad.org/page",
  ]);
  assert.deepEqual(filters.allowed, ["github.com", "docs.rs"]);
  assert.deepEqual(filters.blocked, ["spam.com", "bad.org"]);
});

test("matchesDomainFilters: correctly filters hostnames", () => {
  const filters = normalizeDomainFilters([
    "github.com",
    "-blog.github.com",
    "-spam.com",
  ]);
  assert.equal(matchesDomainFilters("github.com", filters), true);
  assert.equal(
    matchesDomainFilters("raw.githubusercontent.com", filters),
    true,
  );
  assert.equal(matchesDomainFilters("blog.github.com", filters), false);
  assert.equal(matchesDomainFilters("spam.com", filters), false);
  assert.equal(matchesDomainFilters("other.org", filters), false);
});

test("mergeResults: applies domains parameter with allowed and blocked lists", () => {
  const results = normalizeResults(
    [
      { title: "Github", abstract: "", url: "https://github.com/org/repo" },
      { title: "Spam", abstract: "", url: "https://spam.com/article" },
      { title: "Docs", abstract: "", url: "https://docs.rs/crate" },
    ],
    "test",
  );
  const filtered = mergeResults([], results, "query", 10, [
    "github.com",
    "-spam.com",
  ]);
  assert.deepEqual(
    filtered.map((r) => r.title),
    ["Github"],
  );
});
