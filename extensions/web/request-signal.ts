export function requestSignal(
  timeoutSec: number,
  signal: AbortSignal | undefined,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutSec * 1000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
