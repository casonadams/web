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
  maxResults: 5,
  searchTimeout: 12,
  searchTotalTimeout: 30,
  searchBackoffMs: 500,
  searchMinIntervalMs: 2000,
  fetchTimeout: 8,
  extractionTimeout: 15,
  pdfWorkerConcurrency: 2,
  pdfWorkerQueueLimit: 2,
  region: parseEnvRegion("WEB_REGION", "wt-wt"),
  fetchLimit: 200,
  fetchMaxBytes: 5_000_000,
  pdfMaxBytes: 20_000_000,
  outputMaxBytes: 45_000,
  searchMaxBytes: 2_000_000,
  allowPrivateNetwork: parseEnvBool("WEB_ALLOW_PRIVATE_NETWORK", false),
  httpRetries: 1,
  fetchCacheTtlSec: 60,
  fetchCacheEntries: 8,
  fetchCacheMaxBytes: 20_000_000,
};
