import { Worker } from "node:worker_threads";
import { config } from "./config.ts";

interface PdfWorkerResult {
  text?: string;
  error?: string;
}

interface PdfWorkerWaiter {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (error: unknown) => void;
  onAbort: () => void;
}

const pdfWorkerQueue = new Set<PdfWorkerWaiter>();
let activePdfWorkers = 0;

function drainPdfWorkerQueue(): void {
  while (
    activePdfWorkers < config.pdfWorkerConcurrency &&
    pdfWorkerQueue.size > 0
  ) {
    const waiter = pdfWorkerQueue.values().next().value;
    if (!waiter) return;
    pdfWorkerQueue.delete(waiter);
    waiter.signal.removeEventListener("abort", waiter.onAbort);
    if (waiter.signal.aborted) {
      waiter.reject(waiter.signal.reason);
      continue;
    }
    activePdfWorkers += 1;
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      activePdfWorkers -= 1;
      drainPdfWorkerQueue();
    });
  }
}

function acquirePdfWorker(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const waiter: PdfWorkerWaiter = {
      signal,
      resolve,
      reject,
      onAbort: () => {
        pdfWorkerQueue.delete(waiter);
        reject(signal.reason);
      },
    };
    signal.addEventListener("abort", waiter.onAbort, { once: true });
    pdfWorkerQueue.add(waiter);
    drainPdfWorkerQueue();
  });
}

function runPdfWorker(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdf-worker.ts", import.meta.url), {
      workerData: bytes,
      transferList: [bytes.buffer as ArrayBuffer],
    });
    let settled = false;
    const onAbort = () => finish(signal.reason);
    const finish = (error?: unknown, text?: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      worker.removeAllListeners();
      worker.terminate().then(
        () => {
          if (error !== undefined) reject(error);
          else resolve(text ?? "");
        },
        (terminationError) => reject(error ?? terminationError),
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (result: PdfWorkerResult) => {
      if (result.error) finish(new Error(result.error));
      else finish(undefined, result.text);
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      finish(
        new Error(
          `PDF worker exited with code ${code} before returning a result`,
        ),
      );
    });
  });
}

export async function pdfToText(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<string> {
  const timeout = new AbortController();
  const timer = setTimeout(
    () =>
      timeout.abort(
        new Error(
          `PDF extraction timed out after ${config.extractionTimeout}s`,
        ),
      ),
    config.extractionTimeout * 1000,
  );
  const extractionSignal = AbortSignal.any([signal, timeout.signal]);
  try {
    const release = await acquirePdfWorker(extractionSignal);
    try {
      return await runPdfWorker(bytes, extractionSignal);
    } finally {
      release();
    }
  } finally {
    clearTimeout(timer);
  }
}
