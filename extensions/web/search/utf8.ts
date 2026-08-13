const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function truncateUtf8(
  value: string,
  maxBytes: number,
  suffix = "...",
): string {
  if (utf8ByteLength(value) <= maxBytes) return value;
  const boundedSuffix = utf8ByteLength(suffix) <= maxBytes ? suffix : "";
  const contentLimit = maxBytes - utf8ByteLength(boundedSuffix);
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > contentLimit) break;
    output += character;
    bytes += characterBytes;
  }
  return `${output.trimEnd()}${boundedSuffix}`;
}
