import { config } from "./config.ts";
import type { ExtractedResource, FetchMode } from "./fetch-types.ts";

interface CacheEntry {
  resource: ExtractedResource;
  expiresAt: number;
}

interface InFlightResource {
  promise: Promise<ExtractedResource>;
  controller: AbortController;
  waiters: number;
}

const extractionCache = new Map<string, CacheEntry>();
const inFlightResources = new Map<string, InFlightResource>();
let extractionCacheBytes = 0;

export function resourceCacheKey(url: string, mode: FetchMode): string {
  return `${config.allowPrivateNetwork ? "private" : "public"}:${mode}:${url}`;
}

function getCachedResource(key: string): ExtractedResource | undefined {
  const entry = extractionCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    extractionCache.delete(key);
    extractionCacheBytes -= entry.resource.size;
    return undefined;
  }
  extractionCache.delete(key);
  extractionCache.set(key, entry);
  return entry.resource;
}

function cacheResource(key: string, resource: ExtractedResource): void {
  if (
    config.fetchCacheTtlSec <= 0 ||
    resource.size > config.fetchCacheMaxBytes
  ) {
    return;
  }
  const previous = extractionCache.get(key);
  if (previous) {
    extractionCache.delete(key);
    extractionCacheBytes -= previous.resource.size;
  }
  while (
    extractionCache.size >= config.fetchCacheEntries ||
    extractionCacheBytes + resource.size > config.fetchCacheMaxBytes
  ) {
    const oldestKey = extractionCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    const oldest = extractionCache.get(oldestKey);
    extractionCache.delete(oldestKey);
    extractionCacheBytes -= oldest?.resource.size ?? 0;
  }
  extractionCache.set(key, {
    resource,
    expiresAt: Date.now() + config.fetchCacheTtlSec * 1000,
  });
  extractionCacheBytes += resource.size;
}

function waitForResource(
  promise: Promise<ExtractedResource>,
  signal: AbortSignal | undefined,
): Promise<ExtractedResource> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export async function getOrLoadResource(
  key: string,
  signal: AbortSignal | undefined,
  load: (signal: AbortSignal) => Promise<ExtractedResource>,
): Promise<ExtractedResource> {
  signal?.throwIfAborted();
  const cached = getCachedResource(key);
  if (cached) return cached;

  let inFlight = inFlightResources.get(key);
  if (!inFlight) {
    const controller = new AbortController();
    const promise = load(controller.signal).then((resource) => {
      cacheResource(key, resource);
      return resource;
    });
    inFlight = { promise, controller, waiters: 0 };
    const created = inFlight;
    inFlightResources.set(key, created);
    const clear = () => {
      if (inFlightResources.get(key) === created) {
        inFlightResources.delete(key);
      }
    };
    promise.then(clear, clear);
  }

  inFlight.waiters += 1;
  try {
    return await waitForResource(inFlight.promise, signal);
  } finally {
    inFlight.waiters -= 1;
    if (inFlight.waiters === 0) {
      if (inFlightResources.get(key) === inFlight) {
        inFlightResources.delete(key);
      }
      inFlight.controller.abort();
    }
  }
}
