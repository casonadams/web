import { createCoalescedOperation } from "../coalesced-operation.ts";
import { config } from "../config.ts";
import type { ExtractedResource, FetchMode } from "./fetch-types.ts";

interface CacheEntry {
  resource: ExtractedResource;
  expiresAt: number;
}

const extractionCache = new Map<string, CacheEntry>();
const loadCoalescedResource = createCoalescedOperation<
  string,
  ExtractedResource
>();
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

export async function getOrLoadResource(
  key: string,
  signal: AbortSignal | undefined,
  load: (signal: AbortSignal) => Promise<ExtractedResource>,
): Promise<ExtractedResource> {
  signal?.throwIfAborted();
  const cached = getCachedResource(key);
  if (cached) return cached;

  return loadCoalescedResource(key, signal, async (sharedSignal) => {
    const resource = await load(sharedSignal);
    cacheResource(key, resource);
    return resource;
  });
}
