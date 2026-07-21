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
test("searchWeb: does not relax an explicit no-results response", async () => {
  const previousMwmblUrl = config.mwmblUrl;
  const previousAllowPrivateNetwork = config.allowPrivateNetwork;
  config.mwmblUrl = "http://127.0.0.1/search";
  config.allowPrivateNetwork = false;
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return {
      code: 0,
      killed: false,
      stdout: 'No results found for "zzqv-no-such-result"',
      stderr: "",
    };
  };
  try {
    await assert.rejects(
      searchWeb({}, '"zzqv-no-such-result"', 1, undefined, execute),
    );
    assert.equal(calls, 1);
  } finally {
    config.mwmblUrl = previousMwmblUrl;
    config.allowPrivateNetwork = previousAllowPrivateNetwork;
  }
});
test("searchWeb: relaxes queries only after an error response", async () => {
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return {
      code: 0,
      killed: false,
      stdout:
        calls === 1
          ? "DuckDuckGo could not complete this search"
          : [
              "   1.  Example result",
              "       A useful result snippet long enough to pass the configured filter.",
              "       example.com/result",
            ].join("\n"),
      stderr: "",
    };
  };
  const response = await searchWeb(
    {},
    'example "quoted phrase"',
    1,
    undefined,
    execute,
  );
  assert.equal(calls, 2);
  assert.equal(response.results[0]?.url, "https://example.com/result");
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
