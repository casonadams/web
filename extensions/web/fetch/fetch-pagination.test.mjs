import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { config } from "../config.ts";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: reuses prepared pagination across cache hits", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("x".repeat(20_000));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/prepared-pagination`;
  const originalEncode = TextEncoder.prototype.encode;
  let encodeCalls = 0;
  TextEncoder.prototype.encode = function (...args) {
    encodeCalls += 1;
    return originalEncode.apply(this, args);
  };
  try {
    const first = await fetchPage(url, 1, 1);
    assert.ok(first.nextOffset > 1);
    const callsAfterFirstPage = encodeCalls;
    await fetchPage(url, first.nextOffset, 1);
    assert.equal(encodeCalls, callsAfterFirstPage);
  } finally {
    TextEncoder.prototype.encode = originalEncode;
  }
});
test("fetchPage: caps output bytes and keeps pagination available", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("x".repeat(100_000));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/large`,
    1,
    2000,
  );
  assert.ok(Buffer.byteLength(page.content) <= 45_000);
  assert.ok(page.nextOffset > 1);
  assert.match(page.content, /Use offset=/);
});
test("fetchPage: preserves indentation at page boundaries", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("header\n  indented\ntail");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/indent`, 2, 1);
  assert.match(page.content, /^ {2}indented\n/);
});
test("fetchPage: paginates plain text", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("one\ntwo\nthree\nfour");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/`, 2, 2);
  assert.equal(page.total, 4);
  assert.equal(page.nextOffset, 4);
  assert.match(page.content, /^two\nthree/);
});
