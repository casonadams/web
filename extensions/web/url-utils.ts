/**
 * Pure URL utility helpers. Lives in its own file so tests can import
 * these without pulling in the UI library that `logic.ts` depends on.
 */

/**
 * True if `url` parses and uses http or https. Anything else (file://,
 * ftp://, malformed input) is rejected so the tool boundary can return
 * a clear "blocked" message instead of issuing a non-web request.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
