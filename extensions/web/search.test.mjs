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
  const pi = {
    exec: async (_command, _args, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        );
      }),
  };
  try {
    await assert.rejects(
      searchWeb(pi, "slow query", 1),
      /timed out after 0.02s/,
    );
  } finally {
    config.searchTotalTimeout = previousTotalTimeout;
    config.searchTimeout = previousProviderTimeout;
  }
});
test("lynxDump: preserves usable stdout from a nonzero exit", async () => {
  const pi = {
    exec: async () => ({
      code: 1,
      killed: false,
      stdout: "   1.  Usable result\n       snippet\n       example.com\n",
      stderr: "transient warning",
    }),
  };
  assert.match(await lynxDump(pi, "https://example.com", 1), /Usable result/);
});
