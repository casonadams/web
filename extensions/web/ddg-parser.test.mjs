import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDdgLite } from "./ddg-parser.ts";
import { relaxedSearchQueries } from "./query-utils.ts";

test("parseDdgLite: parses canonical lynx output", () => {
  const input = [
    "   1.  Example Domain",
    "       This is a useful result snippet with several words",
    "       example.com/path",
  ].join("\n");
  assert.deepEqual(parseDdgLite(input, { minSnippetChars: 0 }), [
    {
      title: "Example Domain",
      abstract: "This is a useful result snippet with several words",
      url: "https://example.com/path",
    },
  ]);
});
test("parseDdgLite: preserves order and rejoins wrapped URLs", () => {
  const input = [
    "   1.  First",
    "       first abstract with enough text",
    "       first.example/path",
    "   2.  Second",
    "       second abstract with enough text",
    "",
    "       verylongdomainexa",
    "   mple.com/path?q=1",
  ].join("\n");
  const results = parseDdgLite(input, { minSnippetChars: 0 });
  assert.deepEqual(
    results.map((result) => result.title),
    ["First", "Second"],
  );
  assert.equal(results[1].url, "https://verylongdomainexample.com/path?q=1");
});
test("parseDdgLite: does not absorb a one-word abstract ending", () => {
  const input = [
    "   1.  Headers",
    "       an abstract ending in a word with punctuation",
    "   headers.",
    "",
    "   example.com/path",
  ].join("\n");
  const [result] = parseDdgLite(input, { minSnippetChars: 0 });
  assert.equal(
    result.abstract,
    "an abstract ending in a word with punctuation headers.",
  );
  assert.equal(result.url, "https://example.com/path");
});
test("parseDdgLite: filters short snippets and invalid URLs", () => {
  const input = [
    "   1.  Short",
    "       tiny",
    "       short.example",
    "   2.  Invalid",
    "       a sufficiently long snippet",
    "       not-a-url",
  ].join("\n");
  assert.deepEqual(parseDdgLite(input, { minSnippetChars: 10 }), []);
});
test("relaxedSearchQueries: removes quotes and natural-language filler", () => {
  assert.deepEqual(
    relaxedSearchQueries(
      "Beyond Inc Overstock Midvale Utah number of employees LinkedIn",
    ),
    ["Beyond Inc Overstock Midvale Utah employees LinkedIn"],
  );
  assert.deepEqual(
    relaxedSearchQueries(
      '1-800 Contacts Draper Utah Glassdoor "Mobile Phone Discount"',
    ),
    ["1-800 Contacts Draper Utah Glassdoor Mobile Phone Discount"],
  );
  assert.deepEqual(
    relaxedSearchQueries("please find API docs site:nodejs.org"),
    ["API docs site:nodejs.org"],
  );
});
