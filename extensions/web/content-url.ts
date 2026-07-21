export function resolveRelativeUrl(target: string, baseUrl: string): string {
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return target;
  }
  try {
    return new URL(target, baseUrl).href;
  } catch {
    return target;
  }
}
