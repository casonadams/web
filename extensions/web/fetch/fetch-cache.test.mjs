import assert from "node:assert/strict";
import { test } from "vitest";
import { config } from "../config.ts";
import { startTestServer } from "../test-helpers.mjs";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: reuses a bounded extraction cache for pagination", async () => {
  let requests = 0;
  const baseUrl = await startTestServer((_request, response) => {
    requests += 1;
    response.setHeader("content-type", "text/plain");
    response.end("one\ntwo\nthree\nfour");
  });
  const url = `${baseUrl}/cached`;
  await fetchPage(url, 1, 2);
  const continuation = await fetchPage(url, 3, 2);
  assert.equal(requests, 1);
  assert.match(continuation.content, /^three\nfour/);
});
test("fetchPage: coalesces concurrent extraction cache misses", async () => {
  let requests = 0;
  const baseUrl = await startTestServer((_request, response) => {
    requests += 1;
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("shared result");
    }, 20);
  });
  const url = `${baseUrl}/concurrent`;
  const pages = await Promise.all([
    fetchPage(url, 1, 20),
    fetchPage(url, 1, 20),
  ]);
  assert.equal(requests, 1);
  assert.equal(pages[0].content, "shared result");
  assert.equal(pages[1].content, "shared result");
});
test("fetchPage: isolates cancellation between concurrent waiters", async () => {
  let requests = 0;
  const baseUrl = await startTestServer((_request, response) => {
    requests += 1;
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("surviving result");
    }, 30);
  });
  const url = `${baseUrl}/independent-cancellation`;
  const controller = new AbortController();
  const cancelled = fetchPage(url, 1, 20, "auto", controller.signal);
  const surviving = fetchPage(url, 1, 20);
  controller.abort(new Error("cancel one waiter"));
  await assert.rejects(cancelled, { message: "cancel one waiter" });
  assert.equal((await surviving).content, "surviving result");
  assert.equal(requests, 1);
});
test("fetchPage: recovers after all in-flight waiters cancel", async () => {
  let requests = 0;
  let firstRequestReceived;
  const firstRequest = new Promise((resolve) => {
    firstRequestReceived = resolve;
  });
  const baseUrl = await startTestServer((_request, response) => {
    requests += 1;
    if (requests === 1) firstRequestReceived();
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("recovered result");
    }, 20);
  });
  const url = `${baseUrl}/cancel-and-retry`;
  const controller = new AbortController();
  const cancelled = fetchPage(url, 1, 20, "auto", controller.signal);
  await firstRequest;
  controller.abort(new Error("cancel only waiter"));
  await assert.rejects(cancelled, { message: "cancel only waiter" });
  assert.equal((await fetchPage(url, 1, 20)).content, "recovered result");
  assert.equal(requests, 2);
});
test("fetchPage: honors cancellation on cache hits", async () => {
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("cached result");
  });
  const url = `${baseUrl}/cancelled-cache`;
  await fetchPage(url, 1, 20);
  const controller = new AbortController();
  controller.abort(new Error("cancelled cache read"));
  await assert.rejects(fetchPage(url, 1, 20, "auto", controller.signal), {
    message: "cancelled cache read",
  });
});
