import assert from "node:assert/strict";
import { it } from "vitest";
import { fetchBytes } from "./http.ts";
import { isHttpUrl } from "./url-utils.ts";

it.each([{ host: "127.0.0.1" }, { host: "localhost" }])(
  "fetchBytes: blocks private-network host $host",
  async ({ host }) => {
    await assert.rejects(
      fetchBytes(`http://${host}/private`, {
        timeoutSec: 1,
        maxBytes: 1000,
        allowPrivateNetwork: false,
        retries: 0,
      }),
      /request blocked: .*non-public address/,
    );
  },
);

it.each([
  { name: "HTTPS URL", input: "https://example.com/path", expected: true },
  { name: "HTTP URL", input: "http://example.com", expected: true },
  { name: "file URL", input: "file:///etc/passwd", expected: false },
  { name: "FTP URL", input: "ftp://example.com", expected: false },
  {
    name: "JavaScript URL",
    input: "javascript:alert(1)",
    expected: false,
  },
  { name: "invalid URL", input: "not a url", expected: false },
  { name: "empty URL", input: "", expected: false },
])("isHttpUrl: $name", ({ input, expected }) => {
  assert.equal(isHttpUrl(input), expected);
});
