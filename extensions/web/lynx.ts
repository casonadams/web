import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export async function lynxDump(
  pi: ExtensionAPI,
  url: string,
  timeoutSec: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  const result = await pi.exec("lynx", ["-dump", "-nolist", url], {
    timeout: timeoutSec * 1000,
    signal,
  });
  if (result.killed) {
    throw new Error(`lynx killed (likely timeout after ${timeoutSec}s)`);
  }
  if (result.stdout.trim()) return result.stdout;
  if (result.code !== 0) {
    const diagnostic = result.stderr.trim() || "no diagnostic output";
    throw new Error(`lynx exited with code ${result.code}: ${diagnostic}`);
  }
  throw new Error("lynx returned no output");
}
