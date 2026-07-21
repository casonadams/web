import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { config } from "./config.ts";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: fetches and converts HTML without lynx", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      "<html><body><h1>Title</h1><script>bad()</script><p>Hello <a href='/docs'>docs</a> and <a href='guide'>guide</a>.</p></body></html>",
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/`, 1, 200);
  assert.match(page.content, /TITLE/);
  assert.match(page.content, /Hello docs \[http:\/\/127\.0\.0\.1:\d+\/docs\]/);
  assert.match(page.content, /guide \[http:\/\/127\.0\.0\.1:\d+\/guide\]/);
  assert.doesNotMatch(page.content, /bad\(\)/);
});
test("fetchPage: respects HTML charset and base href", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=windows-1252");
    response.end(
      Buffer.concat([
        Buffer.from('<html><head><base href="/assets/"></head><body><p>caf'),
        Buffer.from([0xe9]),
        Buffer.from(' <a href="guide">guide</a></p></body></html>'),
      ]),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/page`, 1, 20);
  assert.match(page.content, /café/);
  assert.match(
    page.content,
    new RegExp(`http://127\\.0\\.0\\.1:${address.port}/assets/guide`),
  );
});
test("fetchPage: auto extracts substantial main HTML content", async (t) => {
  const article =
    "Important article content with enough detail for extraction. ".repeat(12);
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><head><title>Article title</title></head><body><nav>NOISY NAVIGATION</nav><main><h1>Article heading</h1><p>${article}</p><pre>const answer = 42;</pre></main><footer>NOISY FOOTER</footer></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/article`;

  const automatic = await fetchPage(url, 1, 200, "auto");
  assert.equal(automatic.extraction, "main");
  assert.match(automatic.content, /main content via <main>/);
  assert.match(automatic.content, /ARTICLE HEADING/);
  assert.match(automatic.content, /const answer = 42/);
  assert.doesNotMatch(automatic.content, /NOISY NAVIGATION/);
  assert.doesNotMatch(automatic.content, /NOISY FOOTER/);

  const full = await fetchPage(url, 1, 200, "full");
  assert.equal(full.extraction, "full");
  assert.match(full.content, /NOISY NAVIGATION/);
  assert.match(full.content, /NOISY FOOTER/);
});
test("fetchPage: reports JavaScript-only application shells", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><body><div id="root"></div><script>${"x".repeat(600)}</script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await assert.rejects(
    fetchPage(`http://127.0.0.1:${address.port}/app`, 1, 20),
    /JavaScript-capable browser/,
  );
});
