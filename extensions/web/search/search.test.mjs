import assert from "node:assert/strict";
import { test } from "node:test";
import { retryAfterMs, searchWeb } from "./search.ts";

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
