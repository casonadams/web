import assert from "node:assert/strict";
import { Response } from "undici";
import { test } from "vitest";
import { readLimitedBody } from "./response-body.ts";

test("readLimitedBody: waits for a split PDF signature before selecting a limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("%P"));
      controller.enqueue(new TextEncoder().encode("DF-content"));
      controller.close();
    },
  });
  const response = new Response(stream, {
    headers: {
      "content-length": "12",
      "content-type": "application/octet-stream",
    },
  });
  const body = await readLimitedBody(response, "application/octet-stream", {
    maxBytes: 5,
    pdfMaxBytes: 20,
  });
  assert.equal(new TextDecoder().decode(body), "%PDF-content");
});
