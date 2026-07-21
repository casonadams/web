import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { config } from "./config.ts";

interface LynxExecutionOptions {
  timeoutMs: number;
  maxBytes: number;
  signal?: AbortSignal;
}

interface LynxExecutionResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  outputLimitExceeded?: boolean;
  errorMessage?: string;
}

export type LynxExecutor = (
  url: string,
  options: LynxExecutionOptions,
) => Promise<LynxExecutionResult>;

const executeLynx: LynxExecutor = (url, options) =>
  new Promise((resolve) => {
    execFile(
      "lynx",
      ["-dump", "-nolist", url],
      {
        encoding: "utf8",
        maxBuffer: options.maxBytes,
        signal: options.signal,
        timeout: options.timeoutMs,
      },
      (error, stdout, stderr) => {
        const errorCode = error?.code;
        resolve({
          stdout,
          stderr,
          code: typeof errorCode === "number" ? errorCode : error ? 1 : 0,
          killed: error?.killed ?? false,
          outputLimitExceeded:
            errorCode === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
          errorMessage: error?.message,
        });
      },
    );
  });

export async function lynxDump(
  _pi: ExtensionAPI,
  url: string,
  timeoutSec: number,
  signal: AbortSignal | undefined,
  maxBytes: number = config.searchMaxBytes,
  executor: LynxExecutor = executeLynx,
): Promise<string> {
  signal?.throwIfAborted();
  let result: LynxExecutionResult;
  try {
    result = await executor(url, {
      timeoutMs: timeoutSec * 1000,
      maxBytes,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw error;
  }
  signal?.throwIfAborted();

  if (
    result.outputLimitExceeded ||
    Buffer.byteLength(result.stdout) > maxBytes
  ) {
    throw new Error(`lynx output exceeded the ${maxBytes}-byte limit`);
  }
  if (result.killed) {
    throw new Error(`lynx killed (likely timeout after ${timeoutSec}s)`);
  }
  if (result.stdout.trim()) return result.stdout;
  if (result.code !== 0) {
    const diagnostic =
      result.stderr.trim() || result.errorMessage || "no diagnostic output";
    throw new Error(`lynx exited with code ${result.code}: ${diagnostic}`);
  }
  throw new Error("lynx returned no output");
}
