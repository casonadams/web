import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "vitest";
import { config } from "../config.ts";
import { fetchBytes } from "../http/http.ts";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: rejects oversized non-PDF content from headers", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.setHeader("content-length", "6000000");
    response.write("oversized");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await assert.rejects(
    fetchPage(`http://127.0.0.1:${address.port}/large.txt`, 1, 20),
    /limit is 5000000/,
  );
});
test("fetchPage: cancels failed HTTP response bodies", async (t) => {
  let responseClosed;
  const closed = new Promise((resolve) => {
    responseClosed = resolve;
  });
  const server = createServer((_request, response) => {
    response.on("close", responseClosed);
    response.writeHead(404, { "content-type": "text/plain" });
    response.write("error body that remains open");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await assert.rejects(
    fetchPage(`http://127.0.0.1:${address.port}/missing`, 1, 20),
    /HTTP 404/,
  );
  await Promise.race([
    closed,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("response body was not cancelled")),
        500,
      ),
    ),
  ]);
});
test("fetchBytes: strips caller headers on cross-origin redirects", async (t) => {
  let redirectedApiKey;
  const target = createServer((request, response) => {
    redirectedApiKey = request.headers["api-key"];
    response.setHeader("content-type", "text/plain");
    response.end("redirected");
  });
  await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => target.close());
  const targetAddress = target.address();
  assert.notEqual(targetAddress, null);
  assert.equal(typeof targetAddress, "object");

  const source = createServer((_request, response) => {
    response.writeHead(302, {
      location: `http://127.0.0.1:${targetAddress.port}/target`,
    });
    response.end();
  });
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => source.close());
  const sourceAddress = source.address();
  assert.notEqual(sourceAddress, null);
  assert.equal(typeof sourceAddress, "object");

  await fetchBytes(`http://127.0.0.1:${sourceAddress.port}/start`, {
    timeoutSec: 1,
    maxBytes: 1000,
    allowPrivateNetwork: true,
    retries: 0,
    headers: { "api-key": "secret" },
  });
  assert.equal(redirectedApiKey, undefined);
});
test("fetchBytes: preserves caller headers on same-origin redirects", async (t) => {
  let redirectedApiKey;
  const server = createServer((request, response) => {
    if (request.url === "/start") {
      response.writeHead(302, { location: "/target" });
      response.end();
      return;
    }
    redirectedApiKey = request.headers["api-key"];
    response.setHeader("content-type", "text/plain");
    response.end("redirected");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");

  await fetchBytes(`http://127.0.0.1:${address.port}/start`, {
    timeoutSec: 1,
    maxBytes: 1000,
    allowPrivateNetwork: true,
    retries: 0,
    headers: { "api-key": "secret" },
  });
  assert.equal(redirectedApiKey, "secret");
});
test("fetchBytes: applies one timeout across redirect hops", async (t) => {
  const server = createServer((request, response) => {
    setTimeout(() => {
      if (request.url === "/start") {
        response.writeHead(302, { location: "/final" });
        response.end();
        return;
      }
      response.setHeader("content-type", "text/plain");
      response.end("too late");
    }, 40);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await assert.rejects(
    fetchBytes(`http://127.0.0.1:${address.port}/start`, {
      timeoutSec: 0.06,
      maxBytes: 1000,
      allowPrivateNetwork: true,
      retries: 0,
    }),
    /timed out/,
  );
});
test("fetchPage: retries one transient HTTP failure", async (t) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(503, { "retry-after": "0" });
      response.end("try again");
      return;
    }
    response.setHeader("content-type", "text/plain");
    response.end("recovered");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/retry`, 1, 20);
  assert.equal(requests, 2);
  assert.match(page.content, /recovered/);
});
test("fetchBytes: surfaces retry-after in the error message", async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(429, {
      "retry-after": "5",
      "content-type": "text/plain",
    });
    response.end("rate limited");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await assert.rejects(
    fetchBytes(`http://127.0.0.1:${address.port}/limited`, {
      timeoutSec: 1,
      maxBytes: 1000,
      allowPrivateNetwork: true,
      retries: 0,
    }),
    /HTTP 429.*retry-after: 5/,
  );
});
test("fetchPage: reports final redirect URL", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/start") {
      response.writeHead(302, { location: "/final" });
      response.end();
      return;
    }
    response.setHeader("content-type", "text/plain");
    response.end("redirected content");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.onTestFinished(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/start`, 1, 20);
  assert.equal(page.finalUrl, `http://127.0.0.1:${address.port}/final`);
  assert.match(page.content, /Final URL after redirects/);
  assert.match(page.content, /redirected content/);
});
test("fetchPage: surfaces useful network failure details", async () => {
  await assert.rejects(
    fetchPage("http://127.0.0.1:1/unreachable", 1, 20),
    /request failed: bad port|request failed: ECONNREFUSED/,
  );
});
