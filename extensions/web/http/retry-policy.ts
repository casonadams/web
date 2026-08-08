import type { Response } from "undici";

export function retryDelay(
  response: Response | undefined,
  attempt: number,
): number {
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

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}
