import type { PreparedLine } from "./fetch-types.ts";

function utf8CharacterBytes(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function prepareLines(text: string, maxBytes: number): PreparedLine[] {
  const encoder = new TextEncoder();
  const output: PreparedLine[] = [];
  for (const line of text.split("\n")) {
    const lineBytes = encoder.encode(line).byteLength;
    if (lineBytes <= maxBytes) {
      output.push({ text: line, bytes: lineBytes });
      continue;
    }
    let current = "";
    let currentBytes = 0;
    for (const character of line) {
      const characterBytes = utf8CharacterBytes(character);
      if (current && currentBytes + characterBytes > maxBytes) {
        output.push({ text: current, bytes: currentBytes });
        current = "";
        currentBytes = 0;
      }
      current += character;
      currentBytes += characterBytes;
    }
    output.push({ text: current, bytes: currentBytes });
  }
  return output;
}

export function preparedSize(lines: PreparedLine[]): number {
  return lines.reduce(
    (size, line, index) => size + line.bytes + (index ? 1 : 0),
    0,
  );
}

export function pageLines(
  lines: PreparedLine[],
  start: number,
  lineLimit: number,
  byteLimit: number,
): { content: string; consumed: number } {
  const selected: string[] = [];
  let bytes = 0;
  const end = Math.min(lines.length, start + lineLimit);
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (!line) break;
    const lineBytes = line.bytes + (selected.length ? 1 : 0);
    if (selected.length > 0 && bytes + lineBytes > byteLimit) break;
    selected.push(line.text);
    bytes += lineBytes;
  }
  return { content: selected.join("\n"), consumed: selected.length };
}
