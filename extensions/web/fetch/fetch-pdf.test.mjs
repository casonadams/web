import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { test } from "vitest";
import { config } from "../config.ts";
import { startTestServer, textPdf } from "../test-helpers.mjs";
import { pdfToText } from "./extract/pdf.ts";
import { fetchPage } from "./fetch.ts";

config.allowPrivateNetwork = true;

test("fetchPage: extracts text from PDFs", async () => {
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(textPdf("Hello from PDF"));
  });
  const page = await fetchPage(`${baseUrl}/document`, 1, 20);
  assert.match(page.content, /\[PDF metadata\]/);
  assert.match(page.content, /Title: Sample PDF/);
  assert.match(page.content, /Author: Test Author/);
  assert.match(page.content, /\[Page 1\/1\]/);
  assert.match(page.content, /Hello from PDF/);
  assert.match(page.content, /https:\/\/example\.com\/reference/);
});
test("fetchPage: limits concurrent PDF workers", async () => {
  const previousConcurrency = config.pdfWorkerConcurrency;
  config.pdfWorkerConcurrency = 1;
  const pdf = textPdf("Concurrent PDF", 1_000_000);
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
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
        fetchPage(`${baseUrl}/concurrent-${id}.pdf`, 1, 20),
      ),
    );
    assert.equal(maxWorkers, 1);
  } finally {
    Worker.prototype.emit = originalEmit;
    config.pdfWorkerConcurrency = previousConcurrency;
  }
});
test("pdfToText: rejects work beyond the bounded queue", async () => {
  const previousConcurrency = config.pdfWorkerConcurrency;
  const previousQueueLimit = config.pdfWorkerQueueLimit;
  const previousTimeout = config.extractionTimeout;
  const controller = new AbortController();
  config.pdfWorkerConcurrency = 0;
  config.pdfWorkerQueueLimit = 1;
  config.extractionTimeout = 0.02;

  const queued = pdfToText(new Uint8Array([1]), controller.signal).catch(
    () => undefined,
  );
  await Promise.resolve();
  try {
    await assert.rejects(
      pdfToText(new Uint8Array([2]), new AbortController().signal),
      /PDF extraction queue is full/,
    );
  } finally {
    controller.abort(new Error("test cleanup"));
    await queued.catch(() => undefined);
    config.pdfWorkerConcurrency = previousConcurrency;
    config.pdfWorkerQueueLimit = previousQueueLimit;
    config.extractionTimeout = previousTimeout;
  }
});

test("fetchPage: waits for PDF worker termination", async () => {
  const pdf = textPdf("Await worker termination");
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
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
    await fetchPage(`${baseUrl}/await-termination.pdf`, 1, 20);
    assert.equal(terminationCompleted, true);
  } finally {
    Worker.prototype.terminate = originalTerminate;
  }
});

test("fetchPage: bounds PDF extraction time", async () => {
  const previousTimeout = config.extractionTimeout;
  config.extractionTimeout = 0.001;
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(textPdf("Slow PDF"));
  });
  try {
    await assert.rejects(
      fetchPage(`${baseUrl}/timed.pdf`, 1, 20),
      /PDF extraction timed out/,
    );
  } finally {
    config.extractionTimeout = previousTimeout;
  }
});
test("fetchPage: applies the larger PDF download limit", async () => {
  const pdf = textPdf("Large PDF remains readable", 5_100_000);
  assert.ok(pdf.byteLength > 5_000_000);
  const baseUrl = await startTestServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(pdf);
  });
  const page = await fetchPage(`${baseUrl}/large.pdf`, 1, 20);
  assert.match(page.content, /Large PDF remains readable/);
});
