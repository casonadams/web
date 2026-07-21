import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { config } from "./config.ts";
import { fetchPage } from "./fetch.ts";
import { textPdf } from "./test-helpers.mjs";

config.allowPrivateNetwork = true;

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
test("fetchPage: limits concurrent PDF workers", async (t) => {
  const previousConcurrency = config.pdfWorkerConcurrency;
  config.pdfWorkerConcurrency = 1;
  const pdf = textPdf("Concurrent PDF", 1_000_000);
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await new Promise((resolve) => setTimeout(resolve, 20));

  const originalEmit = Worker.prototype.emit;
  let activeWorkers = 0;
  let maxWorkers = 0;
  Worker.prototype.emit = function (event, ...args) {
    if (event === "online") {
      activeWorkers += 1;
      maxWorkers = Math.max(maxWorkers, activeWorkers);
    } else if (event === "exit" && activeWorkers > 0) {
      activeWorkers -= 1;
    }
    return originalEmit.call(this, event, ...args);
  };
  try {
    await Promise.all(
      [1, 2, 3].map((id) =>
        fetchPage(
          `http://127.0.0.1:${address.port}/concurrent-${id}.pdf`,
          1,
          20,
        ),
      ),
    );
    assert.equal(maxWorkers, 1);
  } finally {
    Worker.prototype.emit = originalEmit;
    config.pdfWorkerConcurrency = previousConcurrency;
  }
});
test("fetchPage: waits for PDF worker termination", async (t) => {
  const pdf = textPdf("Await worker termination");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  await new Promise((resolve) => setTimeout(resolve, 20));

  const originalTerminate = Worker.prototype.terminate;
  let terminationCompleted = false;
  Worker.prototype.terminate = async function () {
    const code = await originalTerminate.call(this);
    await new Promise((resolve) => setTimeout(resolve, 20));
    terminationCompleted = true;
    return code;
  };
  try {
    await fetchPage(
      `http://127.0.0.1:${address.port}/await-termination.pdf`,
      1,
      20,
    );
    assert.equal(terminationCompleted, true);
  } finally {
    Worker.prototype.terminate = originalTerminate;
  }
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
