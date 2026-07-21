import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "./config.ts";
import { lynxDump } from "./lynx.ts";
import { searchWeb } from "./search.ts";

test("searchWeb: applies an end-to-end provider deadline", async () => {
  const previousTotalTimeout = config.searchTotalTimeout;
  const previousProviderTimeout = config.searchTimeout;
  config.searchTotalTimeout = 0.02;
  config.searchTimeout = 1;
  const execute = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(options.signal.reason),
        { once: true },
      );
    });
  try {
    await assert.rejects(
      searchWeb({}, "slow query", 1, undefined, execute),
      /timed out after 0.02s/,
    );
  } finally {
    config.searchTotalTimeout = previousTotalTimeout;
    config.searchTimeout = previousProviderTimeout;
  }
});
test("searchWeb: propagates an already-aborted caller signal", async () => {
  const reason = new Error("search cancelled by caller");
  const controller = new AbortController();
  controller.abort(reason);
  const execute = async () => {
    assert.fail("lynx should not run for an aborted search");
  };
  await assert.rejects(
    searchWeb({}, "cancelled query", 1, controller.signal, execute),
    (error) => error === reason,
  );
});
test("lynxDump: preserves usable stdout from a nonzero exit", async () => {
  const execute = async () => ({
    code: 1,
    killed: false,
    stdout: "   1.  Usable result\n       snippet\n       example.com\n",
    stderr: "transient warning",
  });
  assert.match(
    await lynxDump(
      {},
      "https://example.com",
      1,
      undefined,
      config.searchMaxBytes,
      execute,
    ),
    /Usable result/,
  );
});
test("lynxDump: rejects output larger than the configured limit", async () => {
  const result = {
    code: 0,
    killed: false,
    stdout: "12345",
    stderr: "",
  };
  const execute = async (_url, options) => {
    assert.equal(options.maxBytes, 4);
    return result;
  };
  await assert.rejects(
    lynxDump({}, "https://example.com", 1, undefined, 4, execute),
    /exceeded the 4-byte limit/,
  );
});
