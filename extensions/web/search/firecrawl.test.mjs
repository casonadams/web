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

test("parseFirecrawlResponse: reports API errors", () => {
  assert.throws(
    () =>
      parseFirecrawlResponse(
        JSON.stringify({ success: false, error: "quota exhausted" }),
      ),
    /quota exhausted/,
  );
});
