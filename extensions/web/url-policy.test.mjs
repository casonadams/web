import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBytes } from "./http.ts";
import { isHttpUrl } from "./url-utils.ts";

test("fetchBytes: blocks private-network requests by default", async () => {
  await assert.rejects(
    fetchBytes("http://127.0.0.1/private", {
      timeoutSec: 1,
      maxBytes: 1000,
      allowPrivateNetwork: false,
    }),
    /request blocked: .*non-public address/,
  );
  await assert.rejects(
    fetchBytes("http://localhost/private", {
      timeoutSec: 1,
      maxBytes: 1000,
      allowPrivateNetwork: false,
      retries: 0,
    }),
    /request blocked: .*non-public address/,
  );
});
test("isHttpUrl: accepts only valid HTTP(S) URLs", () => {
  assert.equal(isHttpUrl("https://example.com/path"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("file:///etc/passwd"), false);
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("not a url"), false);
  assert.equal(isHttpUrl(""), false);
});
