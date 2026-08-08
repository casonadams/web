import assert from "node:assert/strict";
import { it, test } from "vitest";
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

it.each([
  {
    name: "parses retry-after seconds",
    input: new Error("HTTP 429 Too Many Requests (retry-after: 5)"),
    expected: 5000,
  },
  {
    name: "parses retry-after HTTP dates",
    input: new Error(
      "HTTP 429 Too Many Requests (retry-after: Wed, 21 Oct 2099 07:28:00 GMT)",
    ),
    expected: 5000,
  },
  {
    name: "returns undefined without retry-after",
    input: new Error("HTTP 503 Service Unavailable"),
    expected: undefined,
  },
  {
    name: "returns undefined for non-errors",
    input: "not an error",
    expected: undefined,
  },
])("retryAfterMs: $name", ({ input, expected }) => {
  assert.equal(retryAfterMs(input), expected);
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

test("searchWeb: isolates cancellation between coalesced callers", async () => {
  const previousInterval = config.searchMinIntervalMs;
  config.searchMinIntervalMs = 0;
  try {
    const controller = new AbortController();
    const reason = new Error("first caller cancelled");
    let calls = 0;
    const search = (_query, _limit, signal) => {
      calls += 1;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve({ engine: "test", results: [], warnings: [] }),
          30,
        );
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    };
    const cancelled = searchWeb(
      "shared cancellation query",
      1,
      controller.signal,
      search,
    );
    const surviving = searchWeb(
      "shared cancellation query",
      1,
      undefined,
      search,
    );
    setTimeout(() => controller.abort(reason), 10);

    await assert.rejects(cancelled, (error) => error === reason);
    assert.deepEqual(await surviving, {
      engine: "test",
      results: [],
      warnings: [],
    });
    assert.equal(calls, 1);
  } finally {
    config.searchMinIntervalMs = previousInterval;
  }
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
