import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../config.ts";
import { retryAfterMs, searchWeb, searchWithAttempts } from "./search.ts";

test("searchWeb: propagates an already-aborted caller signal", async () => {
  const reason = new Error("search cancelled by caller");
  const controller = new AbortController();
  controller.abort(reason);
  await assert.rejects(
    searchWeb("cancelled query", 1, controller.signal),
    (error) => error === reason,
  );
});

test("retryAfterMs: parses seconds from an HTTP error message", () => {
  assert.equal(
    retryAfterMs(new Error("HTTP 429 Too Many Requests (retry-after: 5)")),
    5000,
  );
  assert.equal(
    retryAfterMs(new Error("HTTP 503 Service Unavailable")),
    undefined,
  );
  assert.equal(retryAfterMs("not an error"), undefined);
});

test("searchWithAttempts: falls back and reports provider warnings", async () => {
  const previousBackoff = config.searchBackoffMs;
  config.searchBackoffMs = 0;
  try {
    const response = await searchWithAttempts("topic", 2, undefined, [
      ["failed", async () => Promise.reject(new Error("unavailable"))],
      ["empty", async () => []],
      [
        "working",
        async () => [
          {
            title: "Result",
            abstract: "Useful result",
            url: "https://example.com/result",
          },
        ],
      ],
    ]);
    assert.equal(response.engine, "working");
    assert.deepEqual(
      response.results.map((result) => result.title),
      ["Result"],
    );
    assert.deepEqual(response.warnings, [
      "failed: unavailable",
      "empty: no results",
    ]);
  } finally {
    config.searchBackoffMs = previousBackoff;
  }
});

test("searchWithAttempts: returns partial results after total timeout", async () => {
  const previousTimeout = config.searchTotalTimeout;
  config.searchTotalTimeout = 0.01;
  try {
    const response = await searchWithAttempts("topic", 2, undefined, [
      [
        "working",
        async () => [
          {
            title: "Partial result",
            abstract: "Available before timeout",
            url: "https://example.com/partial",
          },
        ],
      ],
      [
        "slow",
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      ],
    ]);
    assert.deepEqual(
      response.results.map((result) => result.title),
      ["Partial result"],
    );
    assert.deepEqual(response.warnings, ["search timed out after 0.01s"]);
  } finally {
    config.searchTotalTimeout = previousTimeout;
  }
});

test("searchWithAttempts: propagates cancellation during backoff", async () => {
  const previousBackoff = config.searchBackoffMs;
  config.searchBackoffMs = 1000;
  const controller = new AbortController();
  const reason = new Error("cancelled during backoff");
  const timer = setTimeout(() => controller.abort(reason), 10);
  try {
    await assert.rejects(
      searchWithAttempts("topic", 1, controller.signal, [
        ["failed", async () => Promise.reject(new Error("unavailable"))],
        ["unused", async () => []],
      ]),
      (error) => error === reason,
    );
  } finally {
    clearTimeout(timer);
    config.searchBackoffMs = previousBackoff;
  }
});

test("searchWeb: coalesces identical concurrent queries", async () => {
  let calls = 0;
  const search = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { engine: "test", results: [], warnings: [] };
  };
  const [a, b] = await Promise.all([
    searchWeb("same query", 1, undefined, search),
    searchWeb("same query", 1, undefined, search),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, b);
});

test("searchWeb: does not coalesce queries with different limits", async () => {
  let calls = 0;
  const search = async () => {
    calls += 1;
    return { engine: "test", results: [], warnings: [] };
  };
  await Promise.all([
    searchWeb("same query", 1, undefined, search),
    searchWeb("same query", 5, undefined, search),
  ]);
  assert.equal(calls, 2);
});
