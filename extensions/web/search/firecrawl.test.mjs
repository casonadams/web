import assert from "node:assert/strict";
import { test } from "vitest";
import { parseFirecrawlResponse } from "./engines/firecrawl.ts";

test("parseFirecrawlResponse: normalizes web results and skips invalid entries", () => {
  const body = JSON.stringify({
    success: true,
    data: {
      web: [
        {
          url: "https://example.com/path",
          title: "Example Title",
          description: "A useful result.",
          position: 1,
        },
        null,
        { title: "Missing URL" },
        { url: "https://example.org/no-metadata" },
      ],
    },
  });

  assert.deepEqual(parseFirecrawlResponse(body), [
    {
      title: "Example Title",
      abstract: "A useful result.",
      url: "https://example.com/path",
    },
    {
      title: "",
      abstract: "",
      url: "https://example.org/no-metadata",
    },
  ]);
});

test("parseFirecrawlResponse: compacts descriptions without truncating URLs", () => {
  const url = `https://example.com/${"long-path-segment/".repeat(30)}`;
  const [result] = parseFirecrawlResponse(
    JSON.stringify({
      success: true,
      data: {
        web: [
          {
            url,
            title: "Detailed result",
            description: `# Heading\n\n${"Useful details about the result. ".repeat(30)}`,
          },
        ],
      },
    }),
  );

  assert.equal(result.url, url);
  assert.ok(Buffer.byteLength(result.abstract) <= 300);
  assert.doesNotMatch(result.abstract, /\s{2,}/);
  assert.match(result.abstract, /\.\.\.$/);
});

test("parseFirecrawlResponse: reports API errors", () => {
  assert.throws(
    () =>
      parseFirecrawlResponse(
        JSON.stringify({ success: false, error: "quota exhausted" }),
      ),
    /quota exhausted/,
  );
});
