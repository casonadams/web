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
