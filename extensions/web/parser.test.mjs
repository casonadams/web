import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { config } from "./config.ts";
import { parseDdgLite } from "./ddg-parser.ts";
import { fetchPage } from "./fetch.ts";
import { fetchBytes } from "./http.ts";
import { lynxDump } from "./lynx.ts";
import { parseMwmblResults } from "./mwmbl-parser.ts";
import { relaxedSearchQueries } from "./query-utils.ts";
import { mergeResults, normalizeResults } from "./result-utils.ts";
import { searchWeb } from "./search.ts";
import { isHttpUrl } from "./url-utils.ts";

config.allowPrivateNetwork = true;

function textPdf(text, padding = 0) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Annot /Subtype /Link /Rect [72 700 200 720] /A << /S /URI /URI (https://example.com/reference) >> >>",
    "<< /Title (Sample PDF) /Author (Test Author) >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  if (padding > 0) pdf += `%${"x".repeat(padding)}\n`;
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("parseDdgLite: parses canonical lynx output", () => {
  const input = [
    "   1.  Example Domain",
    "       This is a useful result snippet with several words",
    "       example.com/path",
  ].join("\n");
  assert.deepEqual(parseDdgLite(input, { minSnippetChars: 0 }), [
    {
      title: "Example Domain",
      abstract: "This is a useful result snippet with several words",
      url: "https://example.com/path",
    },
  ]);
});

test("parseDdgLite: preserves order and rejoins wrapped URLs", () => {
  const input = [
    "   1.  First",
    "       first abstract with enough text",
    "       first.example/path",
    "   2.  Second",
    "       second abstract with enough text",
    "",
    "       verylongdomainexa",
    "   mple.com/path?q=1",
  ].join("\n");
  const results = parseDdgLite(input, { minSnippetChars: 0 });
  assert.deepEqual(
    results.map((result) => result.title),
    ["First", "Second"],
  );
  assert.equal(results[1].url, "https://verylongdomainexample.com/path?q=1");
});

test("parseDdgLite: does not absorb a one-word abstract ending", () => {
  const input = [
    "   1.  Headers",
    "       an abstract ending in a word with punctuation",
    "   headers.",
    "",
    "   example.com/path",
  ].join("\n");
  const [result] = parseDdgLite(input, { minSnippetChars: 0 });
  assert.equal(
    result.abstract,
    "an abstract ending in a word with punctuation headers.",
  );
  assert.equal(result.url, "https://example.com/path");
});

test("parseDdgLite: filters short snippets and invalid URLs", () => {
  const input = [
    "   1.  Short",
    "       tiny",
    "       short.example",
    "   2.  Invalid",
    "       a sufficiently long snippet",
    "       not-a-url",
  ].join("\n");
  assert.deepEqual(parseDdgLite(input, { minSnippetChars: 10 }), []);
});

test("relaxedSearchQueries: removes quotes and natural-language filler", () => {
  assert.deepEqual(
    relaxedSearchQueries(
      "Beyond Inc Overstock Midvale Utah number of employees LinkedIn",
    ),
    ["Beyond Inc Overstock Midvale Utah employees LinkedIn"],
  );
  assert.deepEqual(
    relaxedSearchQueries(
      '1-800 Contacts Draper Utah Glassdoor "Mobile Phone Discount"',
    ),
    ["1-800 Contacts Draper Utah Glassdoor Mobile Phone Discount"],
  );
});

test("parseMwmblResults: joins highlighted title and extract fragments", () => {
  assert.deepEqual(
    parseMwmblResults([
      {
        url: "https://example.com/result",
        title: [
          { value: "Example", is_bold: true },
          { value: " result", is_bold: false },
        ],
        extract: [
          { value: "Useful ", is_bold: false },
          { value: "summary", is_bold: true },
        ],
      },
    ]),
    [
      {
        title: "Example result",
        abstract: "Useful summary",
        url: "https://example.com/result",
      },
    ],
  );
});

test("normalizeResults: canonicalizes URLs and adds selection signals", () => {
  const [result] = normalizeResults(
    [
      {
        title: "API reference",
        abstract: "Reference documentation",
        url: "https://docs.example.com/api/?utm_source=test&b=2&a=1#section",
      },
    ],
    "DuckDuckGo via lynx",
  );
  assert.equal(result.url, "https://docs.example.com/api/?a=1&b=2");
  assert.equal(result.hostname, "docs.example.com");
  assert.equal(result.contentHint, "documentation");
  assert.equal(result.source, "DuckDuckGo via lynx");
});

test("mergeResults: deduplicates URLs and prefers HTTPS", () => {
  const current = normalizeResults(
    [{ title: "HTTP", abstract: "first", url: "http://example.com/docs/" }],
    "first",
  );
  const incoming = normalizeResults(
    [{ title: "HTTPS", abstract: "second", url: "https://example.com/docs" }],
    "second",
  );
  const results = mergeResults(current, incoming, "example", 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "HTTPS");
  assert.equal(results[0].url, "https://example.com/docs");
});

test("normalizeResults: converts GitHub blob URLs to direct content", () => {
  const [result] = normalizeResults(
    [
      {
        title: "README",
        abstract: "Repository documentation",
        url: "https://github.com/unjs/unpdf/blob/main/README.md?plain=1",
      },
    ],
    "DuckDuckGo via lynx",
  );
  assert.equal(
    result.url,
    "https://raw.githubusercontent.com/unjs/unpdf/main/README.md",
  );
  assert.equal(result.contentHint, "GitHub");
  const ranked = mergeResults(
    [],
    [{ title: "Other", abstract: "", url: "https://example.com/file" }, result],
    "PDF site:github.com",
    10,
  );
  assert.equal(ranked[0].url, result.url);
});

test("mergeResults: prioritizes exact site-filter matches", () => {
  const results = normalizeResults(
    [
      { title: "Other", abstract: "", url: "https://other.test/page" },
      { title: "Docs", abstract: "", url: "https://docs.example.com/page" },
    ],
    "test",
  );
  assert.deepEqual(
    mergeResults([], results, "topic site:example.com/docs", 10).map(
      (result) => result.title,
    ),
    ["Docs", "Other"],
  );
});

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

test("fetchPage: extracts text from PDFs", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(textPdf("Hello from PDF"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/document`,
    1,
    20,
  );
  assert.match(page.content, /\[PDF metadata\]/);
  assert.match(page.content, /Title: Sample PDF/);
  assert.match(page.content, /Author: Test Author/);
  assert.match(page.content, /\[Page 1\/1\]/);
  assert.match(page.content, /Hello from PDF/);
  assert.match(page.content, /https:\/\/example\.com\/reference/);
});

test("fetchPage: bounds PDF extraction time", async (t) => {
  const previousTimeout = config.extractionTimeout;
  config.extractionTimeout = 0.001;
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(textPdf("Slow PDF"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  try {
    await assert.rejects(
      fetchPage(`http://127.0.0.1:${address.port}/timed.pdf`, 1, 20),
      /PDF extraction timed out/,
    );
  } finally {
    config.extractionTimeout = previousTimeout;
  }
});

test("fetchPage: applies the larger PDF download limit", async (t) => {
  const pdf = textPdf("Large PDF remains readable", 5_100_000);
  assert.ok(pdf.byteLength > 5_000_000);
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(
    `http://127.0.0.1:${address.port}/large.pdf`,
    1,
    20,
  );
  assert.match(page.content, /Large PDF remains readable/);
});

test("fetchPage: rejects oversized non-PDF content from headers", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.setHeader("content-length", "6000000");
    response.write("oversized");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
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
  t.after(() => server.close());
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
  t.after(() => server.close());
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
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/retry`, 1, 20);
  assert.equal(requests, 2);
  assert.match(page.content, /recovered/);
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
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const page = await fetchPage(`http://127.0.0.1:${address.port}/start`, 1, 20);
  assert.equal(page.finalUrl, `http://127.0.0.1:${address.port}/final`);
  assert.match(page.content, /Final URL after redirects/);
  assert.match(page.content, /redirected content/);
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

test("fetchPage: surfaces useful network failure details", async () => {
  await assert.rejects(
    fetchPage("http://127.0.0.1:1/unreachable", 1, 20),
    /request failed: bad port|request failed: ECONNREFUSED/,
  );
});

test("fetchPage: reuses a bounded extraction cache for pagination", async (t) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.setHeader("content-type", "text/plain");
    response.end("one\ntwo\nthree\nfour");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/cached`;
  await fetchPage(url, 1, 2);
  const continuation = await fetchPage(url, 3, 2);
  assert.equal(requests, 1);
  assert.match(continuation.content, /^three\nfour/);
});

test("fetchPage: coalesces concurrent extraction cache misses", async (t) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("shared result");
    }, 20);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/concurrent`;
  const pages = await Promise.all([
    fetchPage(url, 1, 20),
    fetchPage(url, 1, 20),
  ]);
  assert.equal(requests, 1);
  assert.equal(pages[0].content, "shared result");
  assert.equal(pages[1].content, "shared result");
});

test("fetchPage: isolates cancellation between concurrent waiters", async (t) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("surviving result");
    }, 30);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/independent-cancellation`;
  const controller = new AbortController();
  const cancelled = fetchPage(url, 1, 20, "auto", controller.signal);
  const surviving = fetchPage(url, 1, 20);
  controller.abort(new Error("cancel one waiter"));
  await assert.rejects(cancelled, { message: "cancel one waiter" });
  assert.equal((await surviving).content, "surviving result");
  assert.equal(requests, 1);
});

test("fetchPage: recovers after all in-flight waiters cancel", async (t) => {
  let requests = 0;
  let firstRequestReceived;
  const firstRequest = new Promise((resolve) => {
    firstRequestReceived = resolve;
  });
  const server = createServer((_request, response) => {
    requests += 1;
    if (requests === 1) firstRequestReceived();
    setTimeout(() => {
      response.setHeader("content-type", "text/plain");
      response.end("recovered result");
    }, 20);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/cancel-and-retry`;
  const controller = new AbortController();
  const cancelled = fetchPage(url, 1, 20, "auto", controller.signal);
  await firstRequest;
  controller.abort(new Error("cancel only waiter"));
  await assert.rejects(cancelled, { message: "cancel only waiter" });
  assert.equal((await fetchPage(url, 1, 20)).content, "recovered result");
  assert.equal(requests, 2);
});

test("fetchPage: honors cancellation on cache hits", async (t) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/plain");
    response.end("cached result");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const url = `http://127.0.0.1:${address.port}/cancelled-cache`;
  await fetchPage(url, 1, 20);
  const controller = new AbortController();
  controller.abort(new Error("cancelled cache read"));
  await assert.rejects(fetchPage(url, 1, 20, "auto", controller.signal), {
    message: "cancelled cache read",
  });
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
