import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { config } from "./config.ts";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: resolves relative Markdown links outside code fences", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/markdown");
    response.end(
      [
        "[Guide](./guide.md)",
        "![Logo](images/logo.png)",
        "[Reference]: ../reference.md",
        "```md",
        "[Example](./leave-this-relative.md)",
        "```",
      ].join("\n"),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/docs/README.md`,
    1,
    30,
  );
  assert.equal(page.extraction, "markdown");
  assert.match(page.content, new RegExp(`${address.port}/docs/guide\\.md`));
  assert.match(
    page.content,
    new RegExp(`${address.port}/docs/images/logo\\.png`),
  );
  assert.match(page.content, new RegExp(`${address.port}/reference\\.md`));
  assert.match(page.content, /\.\/leave-this-relative\.md/);
});
test("fetchPage: preserves links inside mixed Markdown fences", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/markdown");
    response.end(
      [
        "```md",
        "~~~",
        "[Example](./leave-this-relative.md)",
        "```",
        "[Guide](./guide.md)",
        "[Parenthesized](./guide_(draft).md)",
      ].join("\n"),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/docs/README.md`,
    1,
    30,
  );
  assert.match(page.content, /\[Example\]\(\.\/leave-this-relative\.md\)/);
  assert.match(
    page.content,
    new RegExp(
      `\\[Guide\\]\\(http://127\\.0\\.0\\.1:${address.port}/docs/guide\\.md\\)`,
    ),
  );
  assert.match(
    page.content,
    new RegExp(
      `\\[Parenthesized\\]\\(http://127\\.0\\.0\\.1:${address.port}/docs/guide_\\(draft\\)\\.md\\)`,
    ),
  );
});
test("fetchPage: prefers Atom alternate links over self links", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/atom+xml");
    response.end(
      '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Example Feed</title><entry><title>First post</title><link rel="self" href="/api/entries/1"/><link rel="alternate" href="/posts/1"/><summary>Useful summary.</summary></entry></feed>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/feed.xml`,
    1,
    30,
  );
  assert.match(page.content, new RegExp(`${address.port}/posts/1`));
  assert.doesNotMatch(
    page.content,
    new RegExp(`${address.port}/api/entries/1`),
  );
});
test("fetchPage: formats RSS feeds and resolves entry links", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/rss+xml");
    response.end(
      `<?xml version="1.0"?><rss><channel><title>Example Feed</title><item><title>First post</title><link>/posts/1</link><pubDate>2026-01-02</pubDate><description><![CDATA[<p>Useful <strong>summary</strong>.</p>]]></description></item></channel></rss>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/feed.xml`,
    1,
    30,
  );
  assert.equal(page.extraction, "xml");
  assert.match(page.content, /# Feed: Example Feed/);
  assert.match(page.content, /## 1\. First post/);
  assert.match(page.content, new RegExp(`${address.port}/posts/1`));
  assert.match(page.content, /Useful summary\./);
});
