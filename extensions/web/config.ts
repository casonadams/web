const DEFAULT_CONFIG = {
  maxResults: 5,
  searchTimeout: 12,
  searchTotalTimeout: 30,
  searchBackoffMs: 500,
  searchMinIntervalMs: 2000,
  fetchTimeout: 8,
  extractionTimeout: 15,
  pdfWorkerConcurrency: 2,
  region: "wt-wt",
  fetchLimit: 200,
  fetchMaxBytes: 5_000_000,
  pdfMaxBytes: 20_000_000,
  outputMaxBytes: 45_000,
  searchMaxBytes: 2_000_000,
  httpRetries: 1,
  fetchCacheTtlSec: 60,
  fetchCacheEntries: 8,
  fetchCacheMaxBytes: 20_000_000,
};

function parseEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : defaultValue;
}

function parseEnvNonNegativeInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : defaultValue;
}

function parseEnvBool(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

function parseEnvRegion(key: string, defaultValue: string): string {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  return /^[a-z]{2}-[a-z]{2}$/.test(normalized) ? normalized : defaultValue;
}

export const config = {
  maxResults: parseEnvInt("WEB_MAX_RESULTS", DEFAULT_CONFIG.maxResults),
  searchTimeout: parseEnvInt(
    "WEB_SEARCH_TIMEOUT",
    DEFAULT_CONFIG.searchTimeout,
  ),
  searchTotalTimeout: parseEnvInt(
    "WEB_SEARCH_TOTAL_TIMEOUT",
    DEFAULT_CONFIG.searchTotalTimeout,
  ),
  searchBackoffMs: parseEnvNonNegativeInt(
    "WEB_SEARCH_BACKOFF_MS",
    DEFAULT_CONFIG.searchBackoffMs,
  ),
  searchMinIntervalMs: parseEnvNonNegativeInt(
    "WEB_SEARCH_MIN_INTERVAL_MS",
    DEFAULT_CONFIG.searchMinIntervalMs,
  ),
  fetchTimeout: parseEnvInt("WEB_FETCH_TIMEOUT", DEFAULT_CONFIG.fetchTimeout),
  extractionTimeout: parseEnvInt(
    "WEB_EXTRACTION_TIMEOUT",
    DEFAULT_CONFIG.extractionTimeout,
  ),
  pdfWorkerConcurrency: Math.min(
    8,
    parseEnvInt(
      "WEB_PDF_WORKER_CONCURRENCY",
      DEFAULT_CONFIG.pdfWorkerConcurrency,
    ),
  ),
  region: parseEnvRegion("WEB_REGION", DEFAULT_CONFIG.region),
  fetchLimit: parseEnvInt("WEB_FETCH_LIMIT", DEFAULT_CONFIG.fetchLimit),
  fetchMaxBytes: parseEnvInt(
    "WEB_FETCH_MAX_BYTES",
    DEFAULT_CONFIG.fetchMaxBytes,
  ),
  pdfMaxBytes: parseEnvInt("WEB_PDF_MAX_BYTES", DEFAULT_CONFIG.pdfMaxBytes),
  outputMaxBytes: Math.max(
    1024,
    parseEnvInt("WEB_OUTPUT_MAX_BYTES", DEFAULT_CONFIG.outputMaxBytes),
  ),
  searchMaxBytes: parseEnvInt(
    "WEB_SEARCH_MAX_BYTES",
    DEFAULT_CONFIG.searchMaxBytes,
  ),
  allowPrivateNetwork: parseEnvBool("WEB_ALLOW_PRIVATE_NETWORK", false),
  httpRetries: Math.min(
    5,
    parseEnvNonNegativeInt("WEB_HTTP_RETRIES", DEFAULT_CONFIG.httpRetries),
  ),
  fetchCacheTtlSec: parseEnvNonNegativeInt(
    "WEB_FETCH_CACHE_TTL",
    DEFAULT_CONFIG.fetchCacheTtlSec,
  ),
  fetchCacheEntries: parseEnvInt(
    "WEB_FETCH_CACHE_ENTRIES",
    DEFAULT_CONFIG.fetchCacheEntries,
  ),
  fetchCacheMaxBytes: parseEnvInt(
    "WEB_FETCH_CACHE_MAX_BYTES",
    DEFAULT_CONFIG.fetchCacheMaxBytes,
  ),
};
