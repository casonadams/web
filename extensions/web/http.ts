import { lookup as lookupAsync } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import ipaddr from "ipaddr.js";
import { Agent, fetch, type Response } from "undici";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36 " +
  "pi-web-extension/1.0";

export interface FetchTextOptions {
  timeoutSec: number;
  maxBytes: number;
  pdfMaxBytes?: number;
  allowPrivateNetwork?: boolean;
  retries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface BinaryResponse {
  body: Uint8Array;
  contentType: string;
  url: string;
}

export interface TextResponse {
  body: string;
  contentType: string;
  url: string;
}

interface ErrorDetails {
  code?: unknown;
  message?: unknown;
  address?: unknown;
  port?: unknown;
  cause?: unknown;
  errors?: unknown;
}

function requestSignal(
  timeoutSec: number,
  signal: AbortSignal | undefined,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutSec * 1000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function startsWithPdfSignature(chunks: Uint8Array[]): boolean {
  const signature: number[] = [];
  for (const chunk of chunks) {
    for (const byte of chunk) {
      signature.push(byte);
      if (signature.length === 5) {
        return String.fromCharCode(...signature) === "%PDF-";
      }
    }
  }
  return false;
}

function responseLimit(
  contentType: string,
  chunks: Uint8Array[],
  options: FetchTextOptions,
): number {
  const pdf =
    contentType.includes("application/pdf") || startsWithPdfSignature(chunks);
  return pdf && options.pdfMaxBytes ? options.pdfMaxBytes : options.maxBytes;
}

async function readLimitedBody(
  response: Response,
  contentType: string,
  options: FetchTextOptions,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const declaredHeader = response.headers.get("content-length");
  const declaredLength = declaredHeader ? Number(declaredHeader) : undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      const limit = responseLimit(contentType, chunks, options);
      if (
        declaredLength !== undefined &&
        Number.isFinite(declaredLength) &&
        declaredLength > limit
      ) {
        await reader.cancel();
        throw new Error(
          `response is too large (${declaredLength} bytes; limit is ${limit})`,
        );
      }
      if (size > limit) {
        await reader.cancel();
        throw new Error(`response exceeded the ${limit}-byte limit`);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function collectNetworkDetails(error: unknown, output: string[]): void {
  if (!error || typeof error !== "object" || output.length >= 4) return;
  const details = error as ErrorDetails;
  const code = typeof details.code === "string" ? details.code : undefined;
  const message =
    typeof details.message === "string" ? details.message : undefined;
  const address =
    typeof details.address === "string" ? details.address : undefined;
  const port =
    typeof details.port === "string" || typeof details.port === "number"
      ? String(details.port)
      : undefined;
  const location = address ? ` at ${address}${port ? `:${port}` : ""}` : "";
  const summary = code ? `${code}${location}` : message;
  if (summary && summary !== "fetch failed" && !output.includes(summary)) {
    output.push(summary);
  }
  if (Array.isArray(details.errors)) {
    for (const nested of details.errors) collectNetworkDetails(nested, output);
  }
  collectNetworkDetails(details.cause, output);
}

function networkError(error: unknown): Error {
  const details: string[] = [];
  collectNetworkDetails(error, details);
  const fallback = error instanceof Error ? error.message : String(error);
  return new Error(`request failed: ${details.join(", ") || fallback}`);
}

function isPublicAddress(address: string): boolean {
  let parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    parsed = parsed.toIPv4Address();
  }
  return parsed.range() === "unicast";
}

function assertAllowedUrl(url: URL, allowPrivateNetwork: boolean): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("request blocked: only HTTP and HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error(
      "request blocked: URLs containing credentials are not allowed",
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !allowPrivateNetwork &&
    ipaddr.isValid(hostname) &&
    !isPublicAddress(hostname)
  ) {
    throw new Error(`request blocked: ${url.hostname} is a non-public address`);
  }
}

const publicNetworkLookup: LookupFunction = (hostname, options, callback) => {
  lookupAsync(hostname, {
    all: true,
    verbatim: true,
    family: options.family,
  }).then(
    (addresses) => {
      const blocked = addresses.find(
        ({ address }) => !isPublicAddress(address),
      );
      if (blocked) {
        callback(
          new Error(
            `request blocked: ${hostname} resolved to non-public address ${blocked.address}`,
          ),
          "",
          0,
        );
        return;
      }
      const selected = addresses[0];
      if (!selected) {
        callback(
          new Error(`request failed: ${hostname} resolved to no addresses`),
          "",
          0,
        );
        return;
      }
      callback(null, selected.address, selected.family);
    },
    (error) => callback(networkError(error), "", 0),
  );
};

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(milliseconds)) {
      return Math.max(0, Math.min(5000, milliseconds));
    }
  }
  return Math.min(1000, 200 * 2 ** attempt);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithRetries(
  url: URL,
  options: FetchTextOptions & { dispatcher?: Agent },
): Promise<Response> {
  const retries = Math.max(0, options.retries ?? 1);
  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: requestSignal(options.timeoutSec, options.signal),
        dispatcher: options.dispatcher,
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/pdf,application/json,text/plain;q=0.9,*/*;q=0.1",
          "accept-language": "en-US,en;q=0.8",
          "user-agent": USER_AGENT,
          ...options.headers,
        },
      });
      if (!isRetryableStatus(response.status) || attempt >= retries) {
        return response;
      }
      await response.body?.cancel();
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        if (attempt >= retries) {
          throw new Error(`request timed out after ${options.timeoutSec}s`);
        }
      } else {
        if (options.signal?.aborted) throw error;
        if (attempt >= retries) throw networkError(error);
      }
    }
    await delay(retryDelay(response, attempt), undefined, {
      signal: options.signal,
    });
  }
}

async function fetchFollowingRedirects(
  rawUrl: string,
  options: FetchTextOptions & { dispatcher?: Agent },
): Promise<Response> {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= 10; redirects += 1) {
    assertAllowedUrl(url, options.allowPrivateNetwork ?? false);
    const response = await fetchWithRetries(url, options);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel();
    url = new URL(location, url);
  }
  throw new Error("request failed: too many redirects");
}

export async function fetchBytes(
  url: string,
  options: FetchTextOptions,
): Promise<BinaryResponse> {
  const dispatcher = options.allowPrivateNetwork
    ? undefined
    : new Agent({ connect: { lookup: publicNetworkLookup } });
  const requestOptions = { ...options, dispatcher };
  try {
    const response = await fetchFollowingRedirects(url, requestOptions);

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    return {
      body: await readLimitedBody(response, contentType, requestOptions),
      contentType,
      url: response.url,
    };
  } finally {
    await dispatcher?.close();
  }
}

export async function fetchText(
  url: string,
  options: FetchTextOptions,
): Promise<TextResponse> {
  const response = await fetchBytes(url, options);
  return {
    ...response,
    body: new TextDecoder().decode(response.body),
  };
}
