import type { Response } from "undici";

interface BodyLimitOptions {
  maxBytes: number;
  pdfMaxBytes?: number;
}

function startsWithPdfSignature(chunks: Uint8Array[]): boolean {
  const signature: number[] = [];
  for (const chunk of chunks) {
    for (const byte of chunk) {
      signature.push(byte);
      if (signature.length === 5) {
        return String.fromCharCode(...signature) === "%PDF-";
      }
    }
  }
  return false;
}

function responseLimit(
  contentType: string,
  chunks: Uint8Array[],
  options: BodyLimitOptions,
): number {
  const pdf =
    contentType.includes("application/pdf") || startsWithPdfSignature(chunks);
  return pdf && options.pdfMaxBytes ? options.pdfMaxBytes : options.maxBytes;
}

export async function readLimitedBody(
  response: Response,
  contentType: string,
  options: BodyLimitOptions,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const declaredHeader = response.headers.get("content-length");
  const declaredLength = declaredHeader ? Number(declaredHeader) : undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      const limit = responseLimit(contentType, chunks, options);
      if (
        declaredLength !== undefined &&
        Number.isFinite(declaredLength) &&
        declaredLength > limit
      ) {
        await reader.cancel();
        throw new Error(
          `response is too large (${declaredLength} bytes; limit is ${limit})`,
        );
      }
      if (size > limit) {
        await reader.cancel();
        throw new Error(`response exceeded the ${limit}-byte limit`);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
