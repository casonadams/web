/** Collapse whitespace in extracted text. */
export function strip(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
