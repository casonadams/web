import { setTimeout as delay } from "node:timers/promises";
import { Agent, fetch, type Response } from "undici";
import type {
  BinaryResponse,
  FetchTextOptions,
  TextResponse,
} from "./http-types.ts";
import { networkError } from "./network-errors.ts";
import { assertAllowedUrl, publicNetworkLookup } from "./network-policy.ts";
import { requestSignal } from "./request-signal.ts";
import { readLimitedBody } from "./response-body.ts";
import { isRetryableStatus, retryDelay } from "./retry-policy.ts";

export type {
  BinaryResponse,
  FetchTextOptions,
  TextResponse,
} from "./http-types.ts";
export { requestSignal } from "./request-signal.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36 " +
  "pi-web-extension/1.0";

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
  const requestOptions = {
    ...options,
    dispatcher,
    signal: requestSignal(options.timeoutSec, options.signal),
  };
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
  } catch (error) {
    const timeoutReason = requestOptions.signal.reason;
    if (
      !options.signal?.aborted &&
      requestOptions.signal.aborted &&
      timeoutReason instanceof Error &&
      timeoutReason.name === "TimeoutError"
    ) {
      throw new Error(`request timed out after ${options.timeoutSec}s`);
    }
    throw error;
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
